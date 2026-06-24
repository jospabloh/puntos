# Puntos+ — Project Notes

Puntos+ is a **multi-tenant SaaS loyalty platform** (Base44 backend + Vite/React
front-end). One platform owner (ACACIA) licenses many **tenants** (the `Business`
entity); each tenant runs its own loyalty program with stores, staff, campaigns,
offers, and customers. See `docs/ARCHITECTURE.md` and `docs/PERMISSIONS.md`.

## Base44 schema-as-code

Data models live as schema-as-code in `base44/entities/*.jsonc`, but the running
app reads/writes against the **deployed** schema in the Base44 backend — the two
can drift.

**Always, when working with Base44:** whenever you add or change a field in a
`base44/entities/*.jsonc` file, make sure that change is actually **deployed** to
the Base44 backend (`update_entity_schema` / `create_entity_schema` via the
Base44 MCP). If a field exists only in the repo and not in the deployed schema,
Base44 **silently drops** that field on create/update — the record saves but the
new field never persists (no error). Verify with `list_entity_schemas` and deploy.

> `update_entity_schema` **removes** any property you omit, but **preserves**
> entity-level `rls` and per-field `rls` when omitted. To add a field while
> changing RLS, send the **full** property set plus the new `rls`.

## Base44 RLS for multi-tenant isolation

Every entity↔user RLS comparison has **two halves**, and getting **either** wrong
fails **silently**:

- **Entity side (left of the rule):** custom fields are stored under `data.`, so
  the key must be a built-in (`id`, `created_by_id`, `created_date`,
  `updated_date`) or start with `data.`. A bare `business_id` points at a field
  that doesn't exist → the rule matches **every** row → RLS effectively **OFF**
  (cross-tenant leak).
- **User side (the template):** custom user fields resolve as
  `{{user.data.<field>}}`. The only bare built-ins are `{{user.id}}`,
  `{{user.email}}`, `{{user.role}}`. `{{user.business_id}}` resolves to **nothing**
  → the rule matches **zero** rows → every tenant sees an empty app.

**Service-role functions evaluate as `role: admin` with no end-user context.** The
backend "Safe" functions (`createLoyaltyAccount`, `redeemOffer`, …) read and write
via `base44.asServiceRole`. So **every business-scoped entity must keep a
`{"user_condition":{"role":"admin"}}` branch in the `$or` on all four ops** —
otherwise service-role reads/writes match zero rows and silently no-op.

### The role model

The Base44 built-in `role` field is the RLS role and must match `src/lib/rbac.js`:

- `admin` → **owner** (platform/ACACIA, cross-tenant, service-role tier)
- `business_admin` → **tenant admin**
- `merchant` → **staff/cashier** (also legacy `merchant_role: 'merchant'`)
- `customer` (legacy `user`) → **end consumer**

Tenant scoping uses `{{user.data.business_id}}` (entity side `data.business_id`).
Staff store scoping uses `{{user.data.storeId}}` (note the **camelCase** field name
— set in onboarding, read by RLS). User custom fields are set via
`base44.auth.updateMe({ role, data: { business_id, storeId, … } })`.

### Canonical business-scoped rule (additive)

```jsonc
"read": {
  "$or": [
    { "user_condition": { "role": "admin" } },                  // owner + service role
    { "data.user_id": "{{user.id}}" },                          // customer self (if applicable)
    { "$and": [ { "user_condition": { "role": "merchant" } },        { "data.business_id": "{{user.data.business_id}}" } ] },
    { "$and": [ { "user_condition": { "role": "business_admin" } },  { "data.business_id": "{{user.data.business_id}}" } ] }
  ]
}
```

For the `Business` entity itself, scope by its built-in `id`
(`"id": "{{user.data.business_id}}"`) inside the same `$or` admin branch.

### Migration safety: additive-only

The 2.0.0 migration that introduced multi-tenancy on the live backend was done
**additively** — every pre-existing RLS branch (owner `admin`, customer
`data.user_id`, staff `data.store_id`/`storeId`) was **preserved**, and the new
tenant branches were **added** on top. New branches gate on roles/fields no legacy
record carries yet, so they are inert until data is populated and **no existing
access narrows**. This is the safe way to migrate live RLS (see StockFlow's
CLAUDE.md for the two outages caused by *narrowing* live rules).

## Guard

`npm run validate:rls` parses every `base44/entities/*.jsonc` and fails on any
invalid entity- or user-side RLS path, and warns when a business-scoped op is
missing the service-role `admin` branch. Run it after touching any `rls` block,
and remember to **deploy** the fixed schema — the repo `.jsonc` alone does not
change runtime behavior.

## Build / verify

- `npm run build` — Vite production build (must pass).
- `npm run lint` — ESLint (0 errors required).
- `npm run validate:rls` — RLS static guard.
