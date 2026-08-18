# Puntos+ — Project Notes

Puntos+ is a **multi-tenant SaaS loyalty platform** (Base44 backend + Vite/React
front-end). One platform owner (ACACIA) licenses many **tenants** (the `Business`
entity); each tenant runs its own loyalty program with stores, staff, campaigns,
offers, and customers. See `docs/ARCHITECTURE.md` and `docs/PERMISSIONS.md`.

## License lifecycle is owned by Mission Control (fixed 2026-08-18)

Puntos+ had a **native, live parallel lifecycle cron** — `checkTrialExpiration`
— duplicating the unified portfolio lifecycle that
`jospabloh/acacia-mission-control` (`api/cron/license-lifecycle.js`) already
runs against `Business.billing_status`. Unlike the equivalent crons already
removed from StockFlow/FlowFin (see their CLAUDE.md), this one wasn't scoped
to the tenant (`Business`) at all — it ran against a **second, disconnected
trial clock on the merchant's own `LoyaltyAccount`** (`subscription_status`,
`trial_end_date`), set by `createBusiness/entry.ts` in parallel with (but
never read by) `Business.billing_status`/`trial_end_at`. The two clocks were
computed from the same `trialEndIso` at signup, so they started in sync — but
only `Business.billing_status` was ever advanced by Mission Control, so a
tenant Mission Control correctly kept `active` (e.g. after the owner paid)
would still have their merchant's `LoyaltyAccount` age past its own trial
window, get flagged `inactive`/`suspended` by `checkTrialExpiration`, and
start showing `SuspendedAccountModal`/`TrialBanner` in the app — wrong, and
contradicting what the license panel said.

**Fix:**
- Removed `base44/functions/checkTrialExpiration` entirely.
- `createBusiness/entry.ts` no longer writes `subscription_status` /
  `subscription_plan` / `trial_start_date` / `trial_end_date` on the owner's
  `LoyaltyAccount` — `Business.billing_status`/`trial_end_at` (already written
  in the same function) is the only license authority now.
- All merchant-facing trial/suspended UI (`Home.jsx`, `Wallet.jsx`,
  `Offers.jsx`, `History.jsx`, `Chat.jsx`, `Profile.jsx`, `MerchantPOS.jsx`)
  now derives `isSuspended`/`showTrialBanner` from `useTenant(user)`'s
  `license.isSuspended`/`license.isTrial` + `business.trial_end_at` — the same
  `Business.billing_status`-derived posture `PlatformDashboard.jsx` and
  `PlatformLicenses.jsx` already used — instead of the per-account fields.
  `TrialBanner`/`SuspendedAccountModal` themselves didn't need to change; only
  what feeds them did.
- The `LoyaltyAccount` schema still has the `subscription_status`/`trial_*`
  fields (not dropped — a schema removal on a live entity is a separate,
  riskier change and nothing depends on cleaning them up immediately); nothing
  writes or reads them for lifecycle purposes anymore. `createLoyaltyAccount`
  still stamps `subscription_status: 'active'` on new *customer* (non-merchant)
  accounts — harmless, purely informational, not read by anything.
- `ADMIN_NOTIFICATION_EMAIL` was only ever consumed by the removed cron —
  dropped from `docs/SECURITY-secrets.md`.

Do not re-add a Puntos+-native cron for trial/license status transitions or
lifecycle reminder emails, and do not gate any merchant-facing UI on
`LoyaltyAccount.subscription_status`/`trial_end_date` again — that logic
belongs on `Business.billing_status`, read via `useTenant`/`deriveLicense`
(`src/lib/useTenant.js`), full stop.

**Still needed, cannot be done from this environment:** committing this
removal does **not** un-schedule the cron if the Base44 dashboard has a
scheduled-automation entry pointing at `checkTrialExpiration` — check the
scheduler panel and remove it there too, or Base44 will call an endpoint that
no longer exists (harmless 404s, but worth cleaning up). Also verify
`npx base44 functions deploy` actually ran — the repo change alone doesn't
touch the deployed backend.

**Verified:** `npm run lint`, `npm run build`, `npm run validate:rls` all pass.
**Not verified:** an actual browser session as a merchant mid-trial or
suspended (not achievable in this environment) — the change is a like-for-like
swap of the data source feeding the exact same banner/modal components, so
the UI behavior itself (what shows, when) is unchanged; only which field
authorizes it changed.

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

## Billing write-gate on the POS/redemption functions (fixed 2026-08-18)

A portfolio-standard audit (`jospabloh/acacia-app-standard`, module 3) found
`earnPoints`, `burnPoints`, `redeemOffer`, and `createStore` had **no
billing-status check at all** — a suspended or view-only tenant's cashier
could still accrue/redeem points, a customer could still redeem an offer,
and an admin could still spin up a new store, even though the client already
hides all of this behind `useTenant()`'s `canTenantWrite()`
(`SuspendedAccountModal`/`TrialBanner`, see the "License lifecycle" section
above). The gate existed for the UI; it was never enforced where the actual
writes happen.

**Fix:** each of the four functions now fetches the relevant `Business`
record server-side and rejects with `write_blocked` (403) before any write
if `billing_status` is `view_only`/`suspended`/`archived` or
`status === 'suspended'` — the exact same condition
`useTenant.js`'s `canTenantWrite()` already computes client-side. Platform
owner (`role: admin`) bypasses, same as every other authorization check in
these functions. Deno functions can't import across directories (same
constraint as `createEmployee`/`_billingGuard.ts` in `jospabloh/radar`), so
`isBusinessWriteBlocked()` is duplicated inline in all four — keep them in
sync if the write-gate logic changes, mirroring any future change to
`canTenantWrite()`.

**Verified:** `npm run lint`, `npm run build`, `npm run validate:rls` all
pass. `deno` isn't available in this sandbox and no existing test file
exercises these four functions — unverified against a live suspended
tenant; risk is bounded since this only adds a new rejection path ahead of
existing logic, nothing existing changed for an `active`/`trial` tenant.

## Self-service data export + delete-account (module 7, added 2026-08-18)

`Profile.jsx` had no way to download your own data or delete your account —
just profile edit + notification toggles + logout. New:

- **`exportMyData`** — any role. Returns the caller's own `LoyaltyAccount`,
  `PointsLedger`, `Redemption`, and `NotificationPreference` rows as one
  JSON payload (all reads explicitly scoped to the caller's own
  `user_id`/`account_id`, even though it runs as service role).
  `Profile.jsx` turns the response into a client-side JSON download.
- **`deleteMyAccount`** — **customer role only.** A `business_admin`/
  `merchant`/`admin` deleting themselves would orphan a `Store`/`Business`
  with no operator, which needs a real offboarding flow (reassign or close
  the business first), not one click — those roles get a `contact_support`
  error instead, so the one path to fix an account issue stays open (same
  scoping principle as `jospabloh/radar` leaving `updateSupportTicket`
  outside its billing gate). Closes the account (`LoyaltyAccount.status:
  'closed'`, PII cleared) and deletes the `User` row; **never** deletes
  `PointsLedger`/`Redemption` — those stay as the accounting/audit trail,
  same convention `jospabloh/stockflow` uses for petty cash. `Profile.jsx`
  gates the whole danger-zone card on `isCustomer(user)` so staff/admin
  never see a button that would just 403.

**Not done — dark theme (module 10).** `tailwind.config.js` has
`darkMode: ["class"]` configured but only 2 `dark:` class usages exist across
the entire app; every page is hardcoded to light-mode colors
(`bg-slate-50`, `text-slate-900`, etc.). A real dark theme means re-skinning
every page and component, which is a design-scale initiative — not a
same-session patch, and not attempted here without a way to visually verify
the result in this sandbox. Tracked as a separate initiative, same as
`jospabloh/rumbo`'s deferred module-3 gap.

**Verified:** `npm run lint`, `npm run build`, `npm run validate:rls` all
pass. `deno` unavailable in this sandbox — unverified against a live
account; risk is bounded since `deleteMyAccount` only ever acts on the
caller's own rows and `exportMyData` is read-only.

## Build / verify

- `npm run build` — Vite production build (must pass).
- `npm run lint` — ESLint (0 errors required).
- `npm run validate:rls` — RLS static guard.
