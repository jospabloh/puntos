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

**Verified:** `npm run lint`, `npm run build`, `npm run validate:rls` all
pass. `deno` unavailable in this sandbox — unverified against a live
account; risk is bounded since `deleteMyAccount` only ever acts on the
caller's own rows and `exportMyData` is read-only.

## Dark theme (module 10, added 2026-08-19)

`tailwind.config.js` already had `darkMode: ["class"]` and `index.css`
already had a complete `.dark` token palette (shadcn boilerplate) — neither
was ever engaged. Fixed:

- **`src/lib/ThemeContext.jsx`** — `ThemeProvider`/`useTheme()`, resolves
  `localStorage('pp-theme')` → `prefers-color-scheme` → light, toggles the
  `.dark` class on `<html>`, persists the choice. `index.html` carries a
  matching inline pre-mount script (same resolution order, kept in sync by
  hand — comment on both sides says so) so there's no light-mode flash
  before React hydrates.
- **`ThemeToggle`** (`Layout.jsx`) — sun/moon icon button wired into both
  shells: the consumer header's mobile menu bar and the back-office
  sidebar/mobile top bar.
- **Every hardcoded neutral color re-skinned.** ~500 `bg-slate-*`/
  `text-slate-*`/`border-slate-*`/`bg-white` occurrences across 37 files
  got a paired `dark:` variant via a scripted inversion (50↔900, 100↔800,
  … symmetric around the scale), preserving any existing variant prefix
  (`hover:text-slate-800` → `hover:dark:text-slate-100`, not a bare
  `dark:text-slate-100` that would apply outside of hover too — the first
  version of the script got this wrong and briefly shipped it, caught by
  diffing before commit). Opacity-suffixed tokens (`bg-slate-900/30`,
  `bg-white/70`) were deliberately left alone — those are almost always
  scrims/overlays/frosted-glass layered over other content, not themed
  surfaces, and a flat inversion would have dropped the opacity. A handful
  of `from-/via-/to-` gradient stops (full-page backgrounds, the auth split
  panel, `WelcomeTrialDialog`) needed the same treatment by hand — the
  script only matched `bg-`/`text-`/`border-`. `PointsCard.jsx`'s
  `from-slate-400 via-slate-300 to-slate-200` is the loyalty tier's
  *silver* color, not a themed surface — intentionally untouched.
  `.pp-glass`/`.pp-shell-bg`/`.glass-card` (the frosted-panel and
  control-room-shell custom classes in `index.css`) got their own `.dark`
  overrides since they're plain CSS, not Tailwind utility classes the
  inversion script could reach.

**Verified, including visually** (unlike every other module-10 deferral in
this portfolio) — a Playwright screenshot pass against the running dev
server confirmed Login/Register/ForgotPassword render correctly in both
themes (the only pages reachable without a live Base44 session in this
sandbox); a scripted coverage sweep confirmed zero remaining un-paired
slate/gray tokens across the scanned files. `npm run lint`, `npm run build`,
`npm run validate:rls` all pass. Not independently visually verified:
the ~30 authenticated pages (Home, Wallet, Offers, the back-office admin
pages, …) — the systematic script covered them the same way as the
verified pages, but an actual authenticated browser session wasn't
achievable here; worth a spot-check on a live deploy.

## Build / verify

- `npm run build` — Vite production build (must pass).
- `npm run lint` — ESLint (0 errors required).
- `npm run validate:rls` — RLS static guard.

## Module 3 — the permission matrix is finally enforced server-side (2026-08-21)

`src/lib/rbac.js`'s `PERMISSIONS` matrix, the `PermissionProfile` override
layer and the `Permissions.jsx` page all existed, but **nothing server-side
ever read them**. `can()` hid a button; the entity was then written straight
from the browser. RLS is not a substitute — it enforces tenant isolation and
the coarse role branches, but it cannot see a `PermissionProfile` row or
`Business.billing_status`, both of which live on a *different* row (Base44
RLS templates have no join). So a tenant admin's override was decorative, and
the billing gate only applied to the four POS/redemption functions fixed on
2026-08-18.

**New `base44/functions/guardedEntityWrite`** — the sanctioned write path for
`Campaign`, `Offer`, `Store`, `Invitation`, `PermissionProfile`, and a
Business's own *settings* fields. Tenant is re-derived from the caller's own
user record, never the request body; on update/delete the **existing**
record's tenant is what gets checked, so a foreign id can't sidestep the
gates; fields are whitelisted. Precedence mirrors `can()`: owner → explicit
override → default matrix, plus the `view_only`/`suspended`/`archived` gate.
`src/lib/guardedWrite.js` is the client wrapper.

**New `base44/functions/adjustCustomerPoints`** — the biggest hole. The manual
adjustment in `AdminCustomers.jsx` was a three-write sequence
(`PointsLedger.create` + `LoyaltyAccount.update` + `AuditLog.create`) run from
the browser with `customers:adjust_points` checked only by `can()`. Points are
the app's unit of value: a `staff` account could mint an arbitrary balance
from devtools *and* write the audit row describing it. Now the capability, the
billing gate, the resulting `balance_after`, the operator identity and the
audit row are all computed server-side from the stored account and the
caller's token, with an idempotency-key guard so a retry can't double an
adjustment.

**`createStore` gained the capability check it never had.** It had the billing
gate (2026-08-18) but no `stores:create` check, so a `staff` account could
create stores despite the capability being business_admin-only. Related:
`AdminStores.jsx`'s client-side create fallback was **removed** — it generated
a store code by racing a `filter()` and wrote the `Store` directly, bypassing
every check. It could not have helped anyway: a browser that can't reach one
backend function can't reach another.

**Drift guard:** each function keeps its own copy of the subset of
`PERMISSIONS` it enforces (Deno can't import from `src/`).
`npm run validate:permissions`, wired into `npm run lint`, fails on any
difference in either direction and on any `ENTITY_CONFIG` capability that
isn't a real key. Confirmed not a no-op by flipping one role list and watching
it fail.

**Deliberately left on direct entity writes**, each already closed by a
non-spoofable built-in in its own RLS — same test `jospabloh/stockflow`'s
`AppSession` note applies: `AppSession` (`created_by_id`; and gating a
heartbeat on billing would lock a suspended tenant out of the screen
explaining why), a customer's own `LoyaltyAccount`/`NotificationPreference`
(`user_id`; no capability finer than "your own row"), and
`SupportTicket`/`SupportTicketMessage` (support must stay reachable for a
suspended tenant — the same reason `updateSupportTicket` sits outside the
billing gate elsewhere in this portfolio).

## Module 1 — license self-escalation on `Business` (fixed 2026-08-21)

Found while scoping the module-3 work. `Business`'s `update` rule granted
**whole-record** write access to a tenant's own `business_admin`
(`$and[role:business_admin, id:{{user.data.business_id}}]`) with **no
field-level lock** on the license fields. Since the 2026-08-18 lifecycle
consolidation the entire app derives `isSuspended`/`isTrial` from
`Business.billing_status` — so a tenant admin could flip their own suspended
tenant back to `active`, or extend their own `trial_end_at`, with one SDK
call. That directly contradicts Module 1's "written ONLY by Mission Control's
unified cron", and it is the same defect class `jospabloh/rumbo` found on
`TenantLicense` (its CLAUDE.md, module 1, 2026-08-19).

**Fixed:** 17 license/billing fields on `Business.jsonc` now carry
`"rls": { "write": false }` — `billing_status`, `status`, `license_plan`,
`license_cycle`, `license_expires_at`, `license_activated_at`,
`licensed_user_limit`, `licensed_store_limit`, `trial_start_at`,
`trial_end_at`, `auto_renewal`, `payment_reference`, `activation_notes`,
`activated_by_admin`, `archived_at`, `scheduled_delete_at`,
`view_only_since`.

Field-level RLS blocks the **client** for every role, owner included, so the
owner console had to move too: **new `base44/functions/licensesAdmin`**
(`patch` / `create_tenant` / `log_event`, platform-tier only, `asServiceRole`
— which bypasses field-level RLS the same way it bypasses entity-level rules)
now backs `PlatformLicenses.jsx` and `PlatformTenants.jsx`. It writes the
`LicenseEvent` in the same call as the patch, so a license change can no
longer land without its audit row — the client used to make two independent
requests and the second could simply not happen.

Unaffected, because both already write as service role: `createBusiness`
(tenant signup) and `acaciaControl`'s `license.set` (Mission Control's own
channel). `support_contacted_at` was deliberately left unlocked — it is a
tenant-side "I asked for an upgrade" marker read by nothing in Mission
Control, and `BusinessBilling.jsx` must keep working for a suspended tenant,
which is precisely the tenant that needs it.

**Deploy note: this is a schema change.** `npx base44 entities push` (or the
MCP `update_entity_schema`) is required — the repo `.jsonc` alone changes
nothing at runtime, and until it is pushed the field locks do not exist in
production. Push the entities BEFORE deploying the functions is not required,
but the client migration and the field locks should land together, since
`PlatformLicenses`/`PlatformTenants` now expect `licensesAdmin` to be live.

**Verified:** `npm run lint` (eslint + `validate:rls` 18 entities +
`validate:permissions` 11 mirrored keys) and `npm run build` both pass.
`deno` isn't available in this sandbox — the three new functions get their
first live check when deployed. **Not verified:** a browser session as a
restricted `staff` or a suspended tenant. Risk is bounded the same way as
every other module-3 fix in this portfolio: each migrated call site preserves
identical behavior for anyone whose role/override already granted access —
the only change is that a denied capability, a read-only tenant's write, or a
tenant editing its own license now correctly fails server-side.

## ACACIA Portfolio Standard

This app is part of the ACACIA portfolio and must stay compliant with
`jospabloh/acacia-app-standard`. Read `STANDARD.md` there before implementing
any item below for the first time, and re-read the relevant section before
touching a module that's already implemented.

- [x] Module 1 — License lifecycle: `Business.billing_status`
      (trial|active|view_only|suspended|archived), written ONLY by Mission
      Control's unified cron; the native `checkTrialExpiration` was removed
      2026-08-18 and the license fields are field-locked since 2026-08-21.
- [x] Module 2 — Roles: `src/lib/rbac.js` (`owner`/`business_admin`/`staff`/
      `customer`), mapped onto Base44's built-in `role`. Mission Control's
      operator roles are a separate layer.
- [x] Module 3 — Granular permissions: `PERMISSIONS` + `PermissionProfile`
      overrides, re-checked server-side by `guardedEntityWrite`,
      `adjustCustomerPoints`, `createStore`, `earnPoints`, `burnPoints` and
      `redeemOffer`, all behind the billing gate. Drift-guarded in `lint`.
- [x] Module 4 — RLS: four-op `$or` shape with the service-role admin branch
      on every business-scoped entity, both halves verified by
      `validate:rls` (19 entities as of 2026-08-31, `Membership` included).
- [x] Module 5 — Health: Mission Control polls `acaciaControl`'s `ping`.
- [x] Module 6 — `src/lib/appConfig.js` (`APP_VERSION`/`RELEASE_DATE`) +
      in-app changelog.
- [x] Module 7 — Profile: `exportMyData` + `deleteMyAccount` (customer-only,
      by design — see that section above).
- [x] Module 8 — Soporte writes `SupportTicket` here first, pushed to Mission
      Control by `notifyTicketCreated` and pulled by `acaciaControl`.
- [x] Module 9 — `apps/puntos-plus.html` on `jospabloh/acaciaco-site`.
- [x] Module 10 — Login on-brand with real error states, dark theme wired
      2026-08-19, suspended/view_only surfaced by `SuspendedAccountModal`/
      `TrialBanner` post-login.
- [x] Module 11 — Deploy discipline: `base44.app.json` + `npm run deploy` /
      `deploy:site` / `deploy:entities`, `validate:functions` in lint
      (26/40). See "Deploy: el id de la app vive en el repo" below.
- [x] Module 12 — Theme control (claro/oscuro/dispositivo), 2026-08-21.
      Estuvo 9 días sin verse en producción, y NO era un hueco de despliegue:
      la SPA no montaba para visitantes anónimos (ver 2.0.19 abajo).
- [x] Module 13 — `npm run test:smoke` against production, in Actions.
      Estuvo rojo del 2026-08-31 al 2026-09-10 y **tenía razón las dos veces**:
      primero señalando un fallo real, después resistiéndose a un deploy que no
      lo arreglaba porque la causa era otra.
- [x] Module 14 — Multi-tenant isolation audit, dated and written down;
      last full pass 2026-08-23, findings closed 2026-08-24 (v2.0.15) and a
      `manageTeamMember`/`Membership` revocation hole closed 2026-09-07.
- [x] Module 15 — Bridge: one derived key per app, `_acaciaSign.ts`,
      `ACACIA_APP_SLUG=puntos` verified against a real sync 2026-08-24.
- [x] Module 16 — Secrets: `npm run check:secrets` in CI;
      `scheduledGuard.ts` fails closed on an unset `SCHEDULED_TASK_SECRET`,
      and `purgeStaleSessions` (module 20) went behind that same guard.
- [x] Module 17 — Mission Control knows this app: row in `apps`, base44
      adapter, licence capabilities, ticket control, catalogue mirror.
- [x] Module 18 — `Membership` + `switchBusiness` + join-by-invite; the
      switch deliberately reloads the page.
- [x] Module 19 — Every field lock carries its own rationale in the schema
      description: what the field is for, what breaks without the lock, and
      that it governs **write, not read**. 17 fields on `Business`, 3 on
      `LoyaltyAccount`, 8 on `User` (2026-09-09).
- [x] Module 20 — Session control, three layers: `useSessionManager`
      (20 min idle → warning → close), `ActiveSessions` in Profile (other
      devices, revocable), and `purgeStaleSessions` (48 h, fail-closed cron
      guard). 2026-09-09 — see its section below for the one deliberate
      deviation from the canonical contract.
- [x] Module 21 — `src/pages/About.jsx`: searchable in-app manual
      (`src/lib/manual.js`), the module-6 changelog surfaced, the version,
      contact, and the ACACIA line. 2026-09-09.
- [x] Module 22 — No write decision is taken from `auth.me()`'s cached
      view: `base44/shared/callerIdentity.ts`, 13 functions migrated
      (2026-09-09).
- [x] Module 23 — Nav active item is route-derived on every render;
      sidebar scroll persists across a reload via `sessionStorage`
      (`useStickyScroll`, 2026-09-09).

Last audited against the standard: 2026-09-09 — the checklist above stopped
at module 10 while the standard had reached 23. Modules 11-18 turned out to
be done already (documented in prose further down this file, just never
checked off); **modules 19-23 did not exist and were built in that pass**.
Details in `CHANGELOG.md` (2.0.18) and in the sections below.

## Deploy: el id de la app vive en el repo (módulo 11, 2026-08-21)

El 2026-08-21, un `git pull` fallido dejó la terminal parada en `flowfin` y los
seis comandos siguientes desplegaron **el backend de FlowFin** en puntos, radar,
stockflow y ctrlhq: la CLI toma el origen del **directorio actual** y el destino
de `--app-id`, y nada comprueba que coincidan. En radar el `entities push` llegó
a completarse y borró el modelo de datos entero. Detalle en
`jospabloh/acacia-app-standard` → `docs/incidents.md`.

Por eso este repo ya no se deploya a mano:

```bash
npm run deploy            # funciones — lee el appId de base44.app.json
npm run deploy:site       # frontend — mergear a main NO lo hace por ti
npm run deploy:entities   # schema — DESTRUCTIVO, pide escribir "Puntos+"
npm run functions:audit   # quién llama a cada endpoint
```

**Mergear a `main` no deploya el sitio.** Se creyó lo contrario durante meses.
En flowfin se comprobó al revés: un fix se mergeó a `main` y, horas después, el
árbol que el app realmente servía seguía siendo el de antes del fix — mergear no
propaga nada (detalle en el CLAUDE.md de flowfin). El
frontend se deploya a mano con `npm run deploy:site`, igual que las funciones.
Y comprueba el resultado por **contenido**, no por hashes: el checkpoint del app
puede reportar un `git_commit_hash` igual al HEAD de `main` mientras el árbol que
de verdad se sirve está atrasado.

`scripts/base44-deploy.mjs` **rechaza** un `--app-id` por argumento, así que el
directorio y la app destino no pueden desalinearse. `deploy:entities` imprime la
lista de entidades y el nombre de la app antes de pedir confirmación — ver
"36 entidades de FlowFin" mientras crees estar desplegando otra app es la señal
de alto que faltaba.

`npm run validate:functions` (dentro de `npm run lint`) falla si los endpoints
pasan de `maxFunctions` en `base44.app.json` — hoy **40**, con
Base44 cortando en 50. El margen importa: por encima del tope el deploy falla a
media aplicación y la CLI **no** llega a su fase de poda, así que las funciones
viejas siguen ocupando los slots que harían falta para arreglarlo.

**Antes de consolidar o borrar cualquier función, corre `npm run functions:audit`.**
Una función sin llamadores en el repo casi nunca está muerta: el llamador vive
fuera, donde grep no ve — un entity hook de Base44, un cron del panel, un
`tool_config` de un agente, la URL de un webhook. El audit marca esas como
`REVISAR EN PANEL` en vez de adivinar; confírmalas contra
`npx base44 functions list` (anota `(N automation)`) antes de tocarlas.

## Selector de tema: claro / oscuro / dispositivo (módulo 12, 2026-08-21)

El tema se elige desde **un solo control**: un círculo pequeño anclado a una
esquina de la pantalla que muestra el modo vigente y, al pulsarlo, crece de lado
en una pista de tres ranuras (Claro · Oscuro · Sistema) con un indicador que se
desliza a la elegida. Tres estados, tres posiciones físicas — que es justo lo
que un botón sol/luna de dos estados no puede expresar en cuanto "seguir al
dispositivo" entra en la lista.

Lo que se guarda es la **preferencia** (`light` | `dark` | `system`), nunca el
color resuelto: con `system` la app sigue a `prefers-color-scheme` en vivo, sin
recargar. `index.html` trae un script pre-montaje que resuelve y aplica el tema
antes de que monte React, así que el primer frame ya sale del color correcto;
ese script y el proveedor comparten clave y valores, y cada uno lleva un
comentario apuntando al otro.

`src/components/ThemeSwitcher.jsx` es **idéntico byte a byte en todas las apps
del portafolio**. La fuente canónica vive en `jospabloh/acacia-app-standard` →
`shared/theme/`: cámbialo allí y cópialo, no lo edites aquí. Lo único propio de
esta app es `src/lib/useThemeMode.js` (de dónde sale el estado) y las variables
`--theme-switcher-bottom/right` en `src/index.css` (dónde se coloca).

`src/lib/ThemeContext.jsx` pasó de dos modos a tres y ahora escucha
`matchMedia` en vivo. Se quitaron los dos `ThemeToggle` de `Layout.jsx` (barra
superior móvil y tarjeta de identidad del sidebar). El control sube por encima
de la barra inferior del shell de consumidor en móvil.

## `npm run test:smoke` — comprueba el sitio DESPLEGADO (2026-08-22)

`tests/smoke/smoke.spec.js` es la suite compartida del portafolio, idéntica byte
a byte en todos los repos; la fuente canónica está en
`jospabloh/acacia-app-standard` → `shared/smoke/`. Lo propio de esta app vive en
`tests/smoke/smoke.config.js` (URL, `<title>`, cómo representa el tema).

**No comprueba el build local: comprueba lo que se sirve.** Es la automatización
de la regla que cada CLAUDE.md repite — mergear no deploya nada, y hay que
verificar por contenido y no por hash. Afirma cuatro cosas, todas derivadas de
lo que el propio repo produce (nunca de copy adivinado, que se rompe al cambiar
una palabra y enseña a ignorar la suite):

1. responde 200 y el `<title>` es el de esta app — no un deploy viejo ni otro;
2. no lanza excepciones al pintar;
3. el tema llega resuelto desde el primer frame (el script pre-montaje viajó);
4. el selector de esquina está montado, cambia el tema y la preferencia
   sobrevive a un reload.

**No corre en el pipeline normal ni desde un sandbox de desarrollo**: la salida
HTTPS ahí va por un proxy con allowlist que no incluye estos dominios. Corre en
GitHub Actions (`.github/workflows/smoke.yml`): `workflow_dispatch` para
dispararla a mano justo después de un deploy, y un cron diario como red.

    npm run test:smoke                      # contra producción
    SMOKE_URL=https://… npm run test:smoke  # contra un preview

Desde el 2026-08-22 la suite añade una quinta afirmación, del **módulo 12**: el
selector no tapa nada y nada lo tapa, en móvil (390), tablet (834) y escritorio
(1440), plegado y desplegado. Un control anclado por encima de todo en una
esquina es justo lo que acaba sentado sobre una barra inferior o un botón
flotante, y entonces la app pierde una función al ancho que nadie abrió. La
comprobación distingue las dos direcciones — algo pintado encima del selector, y
el selector respondiendo por un control que hay debajo — y nombra el control
afectado. Se coloca con `--theme-switcher-bottom/right`; si otra cosa ya es dueña
de esa esquina, se mueve el selector, no el control.

## Módulo 14 — auditoría de aislamiento multi-tenant (2026-08-22)

Nuevo en `jospabloh/acacia-app-standard`. **No es releer las reglas de RLS** (eso
es el módulo 4): es recorrer, con fecha y por escrito, todo lo que puede cruzar
un inquilino con otro — cada entidad, cada función de backend (el inquilino se
re-deriva en el servidor, nunca del cuerpo de la petición, y en update/delete se
comprueba contra el registro **almacenado**), cada campo bloqueado, cada
exportación/reporte/búsqueda, cada destinatario de correo o webhook, y el cambio
de inquilino. Contra el **esquema desplegado**, no contra el archivo del repo.

Se repite cuando se añade una entidad, una función o un rol. El resultado se
anota aquí, incluyendo **lo que no se pudo verificar** desde el entorno de
trabajo — normalmente una sesión autenticada como usuario restringido de un
segundo inquilino. Decirlo vale más que insinuar una cobertura que no se logró.

Lo que motiva el módulo es que todos los fallos de aislamiento que este
portafolio llegó a desplegar eran **sintácticamente válidos**: la rama de rol sin
`$and` al inquilino en `Parish` de cateqhub, las 84 instancias de liuma donde el
motor descartaba la cláusula hermana de `user_condition`, los campos de licencia
escribibles por el propio inquilino en puntos y rumbo, y el `PermissionProfile`
que ningún RLS puede consultar porque vive en otra fila.

### Resultado — 2026-08-23, contra el esquema desplegado

Recorrido completo contra `list_entity_schemas` (appId `696e7fdd7889892fe40868b7`,
18 entidades), no contra los `.jsonc` del repo. Las 23 funciones de
`base44/functions/` se barrieron todas buscando el inquilino tomado del cuerpo
de la petición; las que escriben, exportan o mandan correo se leyeron enteras.

**No encontré ninguna lectura de un inquilino por otro.** Lo que sí encontré son
tres huecos de escritura, ninguno explotable hoy y los tres reales.

#### 1. `earnPoints` y `burnPoints` no miran el inquilino de la cuenta

Las cuatro funciones que mueven puntos comprueban cosas distintas:

| función | qué exige de la cuenta |
|---|---|
| `redeemOffer:63` | `account.business_id` **y** `offer.business_id` presentes **e** iguales |
| `adjustCustomerPoints:77‑79` | el inquilino **es** el de la cuenta; sin él, 403 |
| `earnPoints:107` | `if (account.store_id && account.store_id !== store.id)` |
| `burnPoints:83` | idéntica |

Las dos de abajo nunca leen `account.business_id`, y su comprobación de tienda
está guardada tras un `&&`: **una cuenta con `store_id` vacío pasa**. Cualquier
cajero de cualquier tienda de cualquier inquilino puede acreditarle o
descontarle puntos. `redeemOffer` rechaza exactamente esa forma —"registro
heredado sin inquilino, mejor negar"— y `adjustCustomerPoints` falla cerrada
sola, porque `undefined` nunca iguala al inquilino del llamante. Dos estrictas,
dos permisivas, y la diferencia es un `&&`.

Hay **una fila en producción con esa forma**: la única `LoyaltyAccount` que
existe (`696e817b950f5ea955dd0055`, la del dueño) tiene `business_id: null` y
`store_id: null`. Nace así porque `createBusiness:112` sólo crea la cuenta si el
usuario no tenía una, y ésta es anterior al inquilino.

**Hoy es latente**, y conviene decir por qué y no sólo que lo es: hay un solo
inquilino, esa cuenta tiene saldo 0 y no hay una segunda tienda a la que cruzar.
Se vuelve real el día que exista un segundo inquilino y quede una cuenta sin
tienda — que es justo lo que produce cualquier alta anterior a su asignación.
El arreglo es alinear las dos con `redeemOffer`: exigir `account.business_id` y
compararlo con `store.business_id`, negando cuando falte.

#### 2. `qr_token` es escribible por el propio cliente y nadie exige que sea único

No lleva `rls.write` a nivel de campo, y `LoyaltyAccount.update` incluye la rama
`{"data.user_id":"{{user.id}}"}`. Un cliente puede ponerle a su token el valor
que quiera, incluido el de otro.

**El radio está acotado y vale medirlo antes de alarmarse:** la búsqueda del POS
(`MerchantPOS.jsx:129‑135`) filtra por `qr_token` **y** `store_id`, y la rama
`merchant` de la RLS de lectura exige tienda **y** negocio, así que una colisión
sólo puede darse entre dos clientes de **la misma tienda**. No cruza inquilinos.
Aun así el token lo generan `createLoyaltyAccount`, `regenerateExpiredQR` y
`Wallet.jsx` — no hay razón para que el cliente pueda elegirlo, y un bloqueo de
campo lo cierra sin costo.

#### 3. Un cajero puede empujar una cuenta *fuera* de su inquilino

`business_id` y `store_id` de `LoyaltyAccount` llevan
`rls.write: {$or:[admin, merchant, business_admin]}` — **sin acotar al inquilino
propio en la regla del campo**. La regla de entidad sí acota, pero sobre el
registro *almacenado*: un cajero pasa el filtro por su propia tienda y entonces
escribe un `business_id` ajeno. No puede alcanzar nada de fuera; puede sacar una
fila propia hacia fuera. Ningún punto del cliente hace esto — es una ruta sólo
por SDK — y `guardedEntityWrite` no cubre `LoyaltyAccount` (está en la lista de
exclusiones deliberadas).

### Lo que está bien, y por qué

- **`guardedEntityWrite` es la pieza más sólida de este repo, y por una razón
  que no es la habitual.** El inquilino se re-deriva del registro de usuario del
  llamante (línea 200), y en update/delete se comprueba contra el registro
  **almacenado** (207‑210). Pero donde liuma y rumbo hacen `delete
  data.school_id` / `delete data.tenant_id`, aquí hay una **lista blanca de
  campos** por entidad: `business_id` no aparece en la lista de ninguna de las
  seis, así que no se borra del patch — nunca llega a estar en él. Una lista
  blanca es más estricta que un borrado, porque tapa también el campo que nadie
  se acordó de borrar.
- **`acceptInvitation` ya defiende un cruce real.** El ancla de confianza es el
  correo, no el cuerpo; y si la invitación trae `store_id`, la tienda se
  re-lee y se exige que pertenezca al negocio de la invitación, descartándola si
  no (líneas 45‑60). Nota al margen: el comentario que justifica esa defensa dice
  que «varias ramas `merchant` de RLS se apoyan sólo en `store_id`». **En el
  esquema desplegado ya no es cierto** — `PointsLedger`, `LoyaltyAccount`,
  `Redemption` y `AuditLog` llevan hoy tienda **y** negocio en todas sus ramas
  `merchant`. La defensa se queda igual: `Invitation.store_id` sigue sin
  validarse a nivel de RLS, y una capa que ya está escrita no se quita porque la
  de abajo mejoró.
- **`manageTeamMember`**: el inquilino del objetivo sale del `User` almacenado,
  la tienda se valida contra el inquilino de operación, `ASSIGNABLE_ROLES`
  excluye `admin`, y `setRole` nunca escribe `business_id` — un gerente no puede
  meter a un ajeno, sólo mover a alguien que ya está dentro.
- **`exportMyData`**: cada filtro va contra `user.id` del token, y el ledger y
  los canjes contra el `account_id` de la cuenta propia. Los tres campos existen
  en el esquema desplegado.
- **`sendWeeklySummary`** recorre todas las cuentas, pero cada correo va a
  `account.user_email` con las cifras de esa misma cuenta. `notifyTicketCreated`
  re-lee el ticket como service role y el único destinatario es Mission Control.
- **`passkitWebService`**: el token es `HMAC(secreto, serial)` y se compara
  contra el serial **pedido**, en tiempo constante. La rama que lista los pases
  de un dispositivo va sin autenticar **a propósito**: así lo define la
  especificación de PassKit (ese endpoint no lleva cabecera `ApplePass`), y sólo
  devuelve los ids registrados a ese dispositivo.
- **Bloqueos de campo confirmados en vivo**: los 17 de licencia en `Business`, y
  en `User` los de `role` / `app_role` / `business_id` / `storeId` / `store_id` /
  `merchant_role`, todos a `{"user_condition":{"role":"admin"}}`. No hay
  auto‑escalada por `auth.updateMe`.
- **`owner_email` de `Business` no está bloqueado, y aquí no importa.** En rumbo
  ese mismo campo encadena con un `delete` que se apoya en él; en puntos
  `Business.delete` es sólo `admin` y `owner_email` no autoriza nada — sólo se
  pinta en `PlatformTenants.jsx`. Vale decirlo explícitamente para que nadie
  copie el hallazgo de rumbo a este repo sin comprobarlo.
- **No hay cambio de inquilino en esta app.** Un `business_id` por usuario y
  ninguna entidad `Membership`: la pregunta «¿en qué inquilino estoy?» tiene una
  sola respuesta y no hay dos sitios que puedan discrepar.

### Dos cosas que aparecieron y no son del módulo 14

- `manageTeamMember` se controla con `role === 'business_admin'` a secas, no con
  la clave `users:update_role` que `guardedEntityWrite` sí exige para escribir
  `PermissionProfile`. Un override que niegue esa clave se respeta en un sitio y
  se ignora en el otro. Es módulo 3.
- `manageTeamMember` tampoco lleva puerta de facturación: un inquilino suspendido
  puede seguir cambiando roles. Puede ser deliberado (misma familia que dejar
  soporte accesible), pero no está escrito en ningún sitio que lo sea.

### Lo que no pude verificar

Una sesión autenticada como usuario restringido de un **segundo** inquilino —
porque no hay segundo inquilino. El estado vivo al 2026-08-23 es: **1
`Business`** ("Owner Sandbox", `trial`), **1 `User`**, **1 `LoyaltyAccount`**.

Y de paso, algo que sólo se ve mirando los datos y no el repo: ese único usuario
es `h.josepablo@gmail.com` con `role: business_admin` y **sin `business_id`**. Con
eso, `licensesAdmin` (que exige `role === 'admin'`) le responde 403, y
`Business.read` —`id == {{user.data.business_id}}` o `admin`— no le empareja
ninguna fila. **La consola de dueño no es alcanzable por la única cuenta que
existe.** No es un fallo de aislamiento, pero es la razón de fondo por la que
nada de lo de arriba se pudo ejercitar contra datos reales.

### Cierre — 2026-08-24 (v2.0.15)

Auditoría programada de portafolio re-corrió el módulo 14 sobre este mismo
archivo y encontró los tres hallazgos de arriba **todavía presentes** en el
código/esquema — la sección anterior los documentaba como reales pero no
llegó a arreglarlos. Los tres se cerraron en esta pasada:

1. `earnPoints`/`burnPoints` ganaron el mismo chequeo fail-closed que
   `redeemOffer` ya tenía: `account.business_id` debe existir y coincidir con
   `store.business_id`, antes del chequeo de `store_id` preexistente (que se
   queda, como segunda restricción).
2. `LoyaltyAccount.qr_token` pasó a `rls.write: false`.
3. `LoyaltyAccount.business_id`/`store_id` ganaron el mismo `$and` de
   `data.business_id == {{user.data.business_id}}` que la regla de entidad
   `update` ya aplicaba, a nivel de campo.

Ningún hallazgo nuevo. Sigue sin poderse verificar contra un segundo
inquilino real — el estado vivo no cambió. Detalle completo en
`CHANGELOG.md` (2.0.15). **Pendiente, como en el módulo 1**: desplegar el
esquema (`npm run deploy:entities`) — los tres campos de `LoyaltyAccount`
tocados aquí no toman efecto en producción hasta ese paso.

Una revisión automática (Codex) sobre el PR encontró, antes de mergear, que
bloquear `qr_token` rompía el refresco propio de `Wallet.jsx` (escribía el
campo directo desde el navegador cada 5 minutos). Nueva
`base44/functions/refreshQrToken` — mismo patrón que `exportMyData`, service
role acotado a la cuenta propia del llamante — reemplaza esa escritura
directa; no es lo mismo que `regenerateExpiredQR` (ese es el cron sin sesión
de usuario que barre todas las cuentas). Confirma otra vez el patrón: un
bloqueo de campo puede romper a un escritor legítimo que nadie recordaba, y
vale re-grepear los usos del campo antes de bloquearlo, no solo los de
lectura.

### Reaudit — 2026-08-31 (tras Módulo 18)

> **Sobre el número de versión:** esta pasada se registró en su momento como
> `v2.0.17`, pero esa versión **nunca existió**. La rama que la llevaba se
> quedó abierta mientras `main` avanzaba 2.0.16 → 2.0.18, así que al mergear
> se dejó caer el bump y este contenido entró como documentación dentro de la
> 2.0.18. Es la tercera colisión de versión seguida entre PRs de auditoría en
> este repo: **el número se elige al mergear, no al abrir el PR.**

Auditoría programada de portafolio. Módulo 18 (switching/joining entre
negocios, `jospabloh/acacia-app-standard` → STANDARD.md) se añadió el
2026-08-26 sin que este archivo registrara el re-recorrido que el propio
módulo 14 exige al agregar una entidad o función nueva — y switching entre
inquilinos es exactamente el escenario que la pasada del 2026-08-23 marcó
como inexistente en esta app («No hay cambio de inquilino en esta app»,
arriba). Se hizo aquí, contra el código y el esquema desplegado
(`Membership` ya en `list_entity_schemas`, 19 entidades).

**Sin hallazgos nuevos de aislamiento.** `Membership.read` está acotado por
`data.user_id`, nunca por negocio — es justo lo que permite listar
membresías de negocios en los que el usuario no tiene activo su
`business_id`. `create`/`update`/`delete` son `role: admin` en exclusiva,
igual que el resto de entidades que cruzan inquilino en este repo
(`User.role`/`business_id`, los campos de licencia de `Business`).
`createBusiness`, `acceptInvitation` y la función nueva `switchBusiness`
re-derivan siempre desde el `Membership` almacenado del llamante — nunca del
cuerpo de la petición — y un `business_id` fuera de ese conjunto responde el
mismo 404 genérico que uno inexistente (sin oráculo de existencia).
`switchBusiness` nunca escribe `role: admin`, y el dueño de plataforma no
recibe fila `Membership` al crear un negocio (evita que el selector lo
"cambie" a `business_admin` de su propio negocio, perdiendo el nivel
plataforma).

**Corrección, agregada 2026-09-09 al resolver el conflicto de esta pasada
con la del 2026-09-07:** «sin hallazgos nuevos» era falso. Un review de
Codex sobre el PR que registraba esta reauditoría marcó que
`manageTeamMember` nunca tocaba `Membership` al remover o degradar a un
miembro — y `switchBusiness` lee `Membership` en solitario, nunca el `User`
en vivo, así que la persona removida podía recuperar su acceso viejo con una
sola llamada. Ver la sección "Módulo 14 — hallazgo real en `manageTeamMember`"
más abajo para el detalle completo y el arreglo (ya aplicado, en
`base44/functions/manageTeamMember/entry.ts`).

**Un hallazgo de dependencias, documentado y NO cerrado en esta pasada.**
`npm audit` reporta `react-router`/`react-router-dom` 6.30.4 (severidad
moderada, dos avisos: open-redirect vía backslash en `<Link>`/`useNavigate`,
y constructor injection en hidratación SSR — este segundo no aplica, esta
app es un SPA de Vite sin SSR). El arreglo real exige `react-router-dom`
>=7.18, un salto de versión mayor (v6→v7); `npm audit fix` sin `--force`
sólo ofrece 6.30.4→6.30.6, que sigue dentro del rango vulnerable (no cierra
nada). No se aplicó aquí: mergear un salto mayor sin cobertura de regresión
manual sobre cada ruta, dentro de una corrida automatizada, es exactamente
el tipo de cambio que este archivo lleva quince módulos advirtiendo que no
se apruebe a ciegas (ver el incidente de FlowFin/Radar en el módulo de
deploy, arriba). Queda pendiente como tarea propia, con navegación manual
por las rutas de consumidor y back-office antes de mergear.

No pude verificar, otra vez, contra un segundo inquilino real con dos
membresías activas — el estado vivo sigue siendo el mismo único negocio que
la pasada de 2026-08-23 ya documentaba.

## Módulo 15 — el puente con Mission Control: una llave por app (2026-08-23)

`INGEST_HMAC_SECRET` es **un solo valor compartido por todo el portafolio**, así
que una firma hecha con él demuestra «alguien tiene el secreto compartido» y
nunca «esto es Puntos+». Como el nombre de la app viaja en el cuerpo, cualquier
app podía firmar una carga diciendo ser otra y Mission Control la escribía con
esa atribución. Lo encontró la auditoría del módulo 14 de Mission Control.

El arreglo es dejar de usar el maestro directamente:

    appKey = HMAC-SHA256(maestro, "acacia.app.v1." + slug)

El prefijo es separación de dominio: garantiza que una llave derivada no puede
coincidir con una firma sobre un cuerpo, y el `v1` permite rotar el esquema sin
rotar el maestro.

`base44/functions/{acaciaControl,notifyTicketCreated}/_acaciaSign.ts`
es **idéntico byte a byte en todas las apps del portafolio**. La fuente
canónica vive en `jospabloh/acacia-app-standard` →
`shared/bridge/acaciaSign.ts`: cámbialo allí y cópialo, no lo edites aquí.
Deno aísla cada directorio de función, así que esta app lleva **dos** copias
idénticas: `acaciaControl` **verifica** lo que llega y `notifyTicketCreated`
**firma** el ticket que sale, con `signAs(secret, app, ts, 'ticket.ingest', …)`.

**La migración tiene un orden y es el contrario del obvio.** La verificación
acepta las dos llaves mientras `ACCEPT_LEGACY_MASTER` sea `true`, así que da
igual quién despliegue primero. Pero Mission Control despliega al mergear y las
apps a mano, así que MC siempre va primero — por eso MC sigue **firmando** con
el maestro hasta que las nueve apps acepten derivada. **Los dos pasos ya están hechos** (2026-08-24): MC firma con `signFor` y
`ACCEPT_LEGACY_MASTER` está en `false` en los once sitios, así que una firma con
el maestro **ya no se acepta** — que es exactamente lo que cierra el agujero. `ACACIA_APP_SLUG=puntos` está puesto **y verificado** — ver abajo,
porque el valor que traía de cuando se cableó el push de tickets no era éste.

**Corrección del 2026-08-24: ese «ya estaba puesto» nunca se comprobó, y era
falso.** En la primera sincronización de las nueve apps de ese día, Mission
Control registró que **puntos rechazó la llave derivada y aceptó el maestro** —
junto con las otras tres que tampoco pasaron. Las cuatro son justo las que
traían el secreto de antes, de cuando se cableó el push de tickets; las cinco a
las que se les puso ese día verificaron derivada a la primera. O sea: aquí había
un `ACACIA_APP_SLUG`, pero con un valor que no producía la llave que MC calcula.

**No era un `acaciaControl` viejo**, que era la otra hipótesis: al redesplegar,
la CLI reportó `acaciaControl unchanged`, así que el código vivo ya traía
`_acaciaSign.ts` desde antes de esa sincronización. La única variable que
quedaba era el valor del secreto.

Corregido el mismo día. La sincronización de las 16:29 UTC dio nueve filas de
auditoría y **cero** advertencias `rejected the derived key`, y con esa medición
—no con una fecha— se apagó el flag en los once sitios y se borró el respaldo de
Mission Control.

Lo que hay que quedarse: **un secreto que nadie ha releído no está configurado.**
Este archivo afirmó por escrito durante días que lo estaba. El módulo 16 del
estándar existe por esto.

**Y ahora hay una prueba, que es lo que faltaba.** El helper no lo comprobaba
nada: cada PR de este módulo decía que recibía su primer type-check al
desplegar. `acaciaSign.test.ts` (canónico en el repo estándar) fija el vector
que la mitad Node de Mission Control ya fijaba —dos implementaciones de HMAC en
dos runtimes sólo siguen siendo iguales si algo lo afirma, y una divergencia se
ve en runtime como `bad signature` en cada llamada, que parece un secreto mal
puesto y no lo es— y afirma lo que este módulo promete: un cuerpo firmado por
una app que dice ser otra **no** verifica. No tiene imports externos ni toca la
red, así que corre en un sandbox donde `jsr.io` y `deno.land` están bloqueados.
El test canónico está en el repo estándar; este repo no tiene paso de deno en CI.

**La criptografía en línea que esto reemplaza ya no está.** Cada `acaciaControl`
llevaba su propio `stableStringify` / `hmacHex` / `timingSafeEqual`, copiados a
mano contra `api/_lib/ingestSign.js` de Mission Control. Dejarlos al lado del
helper no es desorden: es una segunda implementación de la misma rutina en el
mismo archivo, que es exactamente la deriva que este módulo quita.

### `deno` SÍ se puede correr aquí — este archivo decía lo contrario

Este CLAUDE.md repetía «deno no está disponible en este sandbox» y por eso
varios cambios de `base44/functions/` se dieron por no verificables y se
mandaron a que CI los mirara por primera vez. **Es falso.** El binario se baja
de la release de GitHub —el mismo sitio de donde lo saca `setup-deno` en el
runner— y GitHub sí pasa por el proxy:

    curl -sSL -o deno.zip https://github.com/denoland/deno/releases/download/v2.9.5/deno-x86_64-unknown-linux-gnu.zip
    unzip -q deno.zip && chmod +x deno && ./deno --version

Lo que de verdad está bloqueado es `deno.land` y `jsr.io`, así que un test que
importe de ahí no resuelve; uno que no importe nada corre igual que en CI. Es la
misma lección que el `000` del proxy en Mission Control: **que una vía esté
bloqueada no significa que la pregunta no tenga respuesta.**

## Auditoría programada — deploy gap, y un revocado que se auto-restauraba acceso (2026-09-07, v2.0.16)

> **CORRECCIÓN (2026-09-10, v2.0.19): el diagnóstico de «deploy gap» de esta
> sección era FALSO.** El 2026-09-09 se corrió el deploy de verdad —funciones,
> entidades y sitio— y el smoke test siguió rojo, idéntico. La causa real es
> que diez sitios del cliente llamaban a `base44.auth.redirectToLogin()`, así
> que todo visitante anónimo salía al `/login` genérico de Base44 y la SPA no
> montaba nunca. El detalle está en `CHANGELOG.md` (2.0.19).
>
> Se deja escrito en vez de borrarlo porque el error es lo instructivo: la
> hipótesis del hueco de despliegue **encajaba con todos los síntomas**, estaba
> documentada, y ya había pasado de verdad en flowfin. Aun así era la
> equivocada, y el log del propio smoke test traía la respuesta
> (`navigated to ".../login?from_url=..."`) desde la primera corrida. Nadie la
> leyó durante nueve días — se leyó el resumen de fallos, no el log.

`npm run test:smoke` lleva **al menos 7 días corriendo en rojo a diario**
(runs de Actions #12 al #18, 2026-08-31 a hoy) contra
`https://puntosplus.acaciaco.com.mx`, siempre en la misma forma: responde 200
con el `<title>` correcto, no lanza excepciones, el tema llega resuelto antes
del montaje — pero `[data-theme-switcher]` (el control del módulo 12,
2026-08-21) nunca aparece. `ThemeSwitcher` se monta sin condición ninguna en
`src/App.jsx` (fuera del `Router`, junto a `Toaster`, no depende de auth ni de
ruta), así que no hay una razón de código para que falte en un visitante
anónimo en `/`. Esto encaja exactamente con lo que el módulo 11 ya documentó:
**mergear a `main` no deploya el sitio** — falta correr `npm run deploy:site`
a mano desde que se envió el módulo 12, o algo posterior lo revirtió sin
volver a desplegar.

**No se pudo correr el deploy desde este entorno** para confirmarlo o
arreglarlo: `npx base44 whoami` falla (403 al bajar una dependencia del CLI,
sin red a `jsr.io`), no hay ninguna variable `BASE44_*` en este sandbox, y el
conector MCP de Base44 no está autorizado en esta sesión. Queda como acción
pendiente para quien tenga acceso: correr `npm run deploy:site` y confirmar
con un `workflow_dispatch` de `Production smoke test` que el selector aparece.
Si sigue sin aparecer después de un deploy real, deja de ser un hueco de
despliegue y pasa a ser un bug de producto — con su propio seguimiento.

De paso: `npm audit` había subido a 6 avisos desde el cierre de la 2.0.15;
`npm audit fix` (sin `--force`) resolvió los cuatro que tenían parche no
disruptivo (`fflate`, `postcss-selector-parser`, `@humanfs/node`,
`browserslist` — solo cambió `package-lock.json`). El de `react-router` sigue
diferido a propósito (necesita el salto mayor v6→v7, documentado ya en la
reauditoría del módulo 14 que PR #66 tiene abierta desde el 2026-08-31 —
mismo criterio: no forzarlo dentro de una pasada desatendida). `docs/USER_MANUAL.md`
no mencionaba el selector de tema en absoluto (su fecha era anterior al
módulo 12) — se le agregó una sección **Appearance** breve.

### Módulo 14 — hallazgo real en `manageTeamMember`, encontrado por revisión de Codex sobre PR #66

Un review automático de Codex sobre PR #66 marcó, sobre la propia
reauditoría del módulo 14 de esa PR, que `manageTeamMember` nunca tocaba
`Membership` al remover o degradar a un miembro del equipo — y
`switchBusiness` (módulo 18) lee `Membership` en solitario, nunca el `User`
en vivo. Se comprobó leyendo el código: cierto. `remove`/`setRole` sólo
escribían el `User`; la fila `Membership` de ese negocio se quedaba con el
rol viejo. La persona removida o degradada podía llamar a `switchBusiness`
con ese mismo `business_id` y recuperar exactamente el rol, tienda y acceso
al negocio que se le acababa de quitar — una revocación de acceso reversible
por quien la sufría.

**Arreglado en `base44/functions/manageTeamMember/entry.ts`** (esta pasada,
no en PR #66): cada operación ahora sincroniza la fila `Membership` del
objetivo para el negocio en el que opera — `remove` y un `setRole` a
`customer` la borran (no queda rol de inquilino que preservar);
`setRole` a `business_admin`/`merchant` y `assignStore` actualizan su
rol/tienda en el sitio. Nunca crea una fila que no existiera ya — a alguien
sin `Membership` no se le puede devolver el acceso por definición, así que no
hace falta sincronizarle nada.

**Verificado con `deno check`** (el binario se puede bajar en este sandbox,
ver la nota de más abajo) sobre el archivo tocado y, para comparar,
sobre `switchBusiness` sin tocar: los mismos errores de tipos genéricos del
`@base44/sdk` (`Property 'X' does not exist on type '{}'`) aparecen en los
dos, confirmando que no son un problema introducido por este cambio sino un
hueco de tipos preexistente en todo `base44/functions/` — este repo no corre
`deno check` en CI, así que ninguno de los dos archivos había tenido nunca
una comprobación de tipos real hasta ahora.

PR #66 (`claude/sleepy-cray-wio3k2`) llevaba una semana con su check
`lint-and-build` en rojo por dos intentos idénticos de 3-4 segundos, muertos
antes de que `actions/checkout` corriera — reproducción local en verde y el
`CI` de `main` en verde en cada push desde entonces apuntaban a un fallo de
aprovisionamiento del runner, no del código. Se re-disparó desde esta sesión
(sin tocar el branch) y salió verde, confirmando el diagnóstico.

**Verificado:** `npm ci`, `npm run lint` (eslint + `validate:rls` 19 entidades
+ `validate:permissions` + `validate:functions` 25/40), `npm run build`,
`npm run check:secrets`, `npm audit --omit=dev`, `deno check` sobre
`manageTeamMember` y `switchBusiness`. **No verificado:** el deploy del sitio
en sí (sin credenciales aquí) ni una sesión de navegador contra producción —
el hallazgo del deploy se apoya en 7 corridas idénticas del propio smoke test
del portafolio, no en una inspección visual directa; el fix de
`manageTeamMember` no se ejercitó contra un `manageTeamMember` → `Membership`
→ `switchBusiness` real end-to-end (necesita una función Deno desplegada y
una sesión de dos usuarios), sólo revisado por lectura y tipado.


## Auditoría programada — módulos 19 a 23 (2026-09-09, v2.0.18)

La lista de cumplimiento de este archivo llegaba al módulo 10; el estándar va
por el 23. De los trece sin revisar, **ocho ya estaban hechos** —documentados
en prosa aquí abajo, sólo que nunca marcados— y **cinco no existían**. Los
cinco están en esta versión. Lo que sigue es lo que conviene saber antes de
tocarlos.

### `base44/shared/` SÍ se puede importar, y este repo llevaba meses diciendo que no

Cinco archivos repetían que «Deno no puede importar entre directorios de
función», y ése era el motivo declarado de que `isBusinessWriteBlocked()` y
`getAppRole()` estén copiados a mano en media docena de sitios.

**Es falso.** `base44/shared/scheduledGuard.ts` se importa desde cuatro crons
desplegados y funcionando. `cleanupInactiveUsers` llegaba a desmentirlo dentro
del mismo archivo: lo importa en la línea 2 y afirma que no se puede en la
línea 4. Lo que de verdad no se puede es importar desde `src/`, que no viaja en
el bundle desplegado.

Los cinco comentarios están corregidos. Las copias siguen ahí: consolidarlas
toca las cuatro funciones que mueven puntos y merece su propio cambio, no un
apéndice de éste. Pero el motivo por el que siguen duplicadas es ahora "nadie
lo ha hecho todavía", no una limitación inventada del runtime.

Y la lección de fondo, que es la del módulo 16 con otra ropa: **una restricción
técnica que nadie ha vuelto a comprobar no es una restricción, es un recuerdo.**

### Módulo 22 — `auth.me()` sirve para saber QUIÉN eres, no para decidir si se escribe

`base44.auth.me()` es la vista de sesión y está cacheada — es barata justo
porque no vuelve a la base. Trece funciones la usaban para decidir **si**
escribían o **en qué inquilino** escribían.

`base44/shared/callerIdentity.ts` (`resolveCaller`) relee el registro `User`
como servicio y devuelve la identidad autoritativa. **Falla cerrado**: si el
registro no se puede leer, 403, nunca la vista cacheada.

La regla, corta: **`user.id` y `user.email` de `auth.me()`; todo lo demás que
decida una escritura, de `resolveCaller()`.** Y un patch parcial se construye
sobre el objeto recién leído (`{ ...caller.data, ...patch }`), nunca sobre el
cacheado.

Tres casos que había aquí y que no son teóricos:

- `createBusiness` / `acceptInvitation` escribían una fila `Membership` con el
  inquilino y el rol cacheados. `switchBusiness` (módulo 18) confía en
  `Membership` sin releer nunca el `User` — una vista vieja aquí graba una
  pertenencia al inquilino equivocado y le abre esa puerta para siempre.
- `createLoyaltyAccount` **escribía** `role = user.role === 'admin' ? 'admin' :
  'customer'`. Una vista que dijera `customer` de quien ya es `admin` degrada
  al dueño de la plataforma.
- `getAppContext` es el "diff y me lo salto" literal: si el cacheado dice
  `admin` y el almacenado no, la promoción no corre y la respuesta sale igual
  de contenta. Nada en ella lo delata. Así perdió Rumbo dos rondas de
  diagnóstico.

`switchBusiness` ya estaba bien y no se tocó: sólo usa `user.id` y relee
`Membership`.

### Módulo 20 — control de sesión, y la desviación que hay que entender antes de "arreglarla"

Tres capas: `src/hooks/useSessionManager.js` (inactividad 20 min → aviso de 2
min → cierre, más el latido y la comprobación de revocación),
`src/components/ActiveSessions.jsx` en Perfil (los otros dispositivos, con
botón para cerrarlos) y `base44/functions/purgeStaleSessions` (revoca a las
48 h, detrás de `scheduledGuard.ts`, que falla cerrado).

`IdleWarningDialog.jsx` y `SessionExpiredDialog.jsx` son los canónicos del repo
estándar. **Una sola línea diverge**, y está comentada en el propio archivo: el
canónico llama a `base44.auth.redirectToLogin()`, que manda al `/login`
genérico que sirve Base44 — exactamente lo que el módulo 10 de esta app
arregló. Aquí el botón va a `/Login`. Si algún día se unifica, que sea
añadiendo un prop arriba, no revirtiendo esto.

**`useSessionManager.js` NO es byte a byte el canónico, y es a propósito.** El
canónico habla con un router `session` sobre una entidad `Session` con
`device_id` y `status: active|passive|revoked`. Aquí existe `AppSession`, ya
desplegada y leída por `sessions.list` / `sessions.revoke` del puente de
Mission Control, y su marca de revocación es `revoked_at`. Adoptar el contrato
canónico exige campos nuevos en una entidad viva, y **un campo no desplegado se
descarta en silencio al escribir** (ver "Base44 schema-as-code" arriba): un
`status: 'revoked'` escrito antes de desplegar el esquema desaparecería, y la
capa 3 parecería funcionar sin cosechar nada. Esta versión usa sólo campos ya
desplegados, así que funciona el día que se mergea. Migrar al contrato canónico
es posible; se hace desplegando el esquema **primero**.

`src/lib/SessionHeartbeat.jsx` se fusionó aquí — un solo dueño del estado de
sesión. Único cambio de comportamiento: una sesión revocada levanta el diálogo
en vez de rebotar a logout sin explicación.

### Módulo 21 — "Acerca de", y por qué el changelog lleva dos resúmenes

`src/pages/About.jsx`, enlazada desde Perfil y desde la barra lateral. El
manual vive en `src/lib/manual.js` (por área, filtrado por rol, buscando sin
acentos ni mayúsculas); `docs/USER_MANUAL.md` es el mismo material en largo y
en inglés — **al cambiar una función, actualiza los dos**.

El arreglo `CHANGELOG` de `appConfig.js` existía desde la 2.0.14 y **no lo leía
nadie**: Perfil sólo importaba `APP_VERSION` y `RELEASE_DATE`. Ahora lo lee
About, que es el consumidor que el módulo 6 siempre supuso.

Cada entrada lleva `resumen` (español llano, lo que cambió para la persona) y
`summary` (el registro técnico que espeja `CHANGELOG.md`). About muestra
`resumen` y cae a `summary` si falta. Los dos porque quien usa la app no
aprende nada de "closed the three module-14 isolation findings", y quien
mantiene el repo pierde el rastro con "revisión de mantenimiento".

**No hay número de WhatsApp** aunque el módulo lo sugiera: no existe ninguno en
este repo y un canal de contacto inventado es peor que ninguno. Cuando exista,
va en esta pantalla.

### Módulo 23 — recargar es rutina en esta app, no una señal de reinicio

El elemento activo del menú ya salía de la ruta en cada render
(`currentPageName` viene del `<Route>` en `App.jsx`), así que sale bien desde el
primer frame. Lo que no se derivaba de nada era el scroll del menú lateral — y
este repo **recarga a propósito**: el cambio de negocio del módulo 18 llama a
`window.location.reload()`. `src/hooks/useStickyScroll.js` lo guarda en
`sessionStorage` (no `localStorage`: sobrevive a la recarga sin filtrarse a
otras pestañas ni dispositivos) y lo restaura en `useLayoutEffect`, antes de
pintar. No hay grupos plegables en esta nav; el scroll era el único estado no
derivable.

### Pendiente, y no se pudo hacer desde aquí

> **Actualizado 2026-09-10:** los puntos 1 a 3 ya se corrieron (21 funciones,
> 19 entidades y el sitio). El punto 4 sigue abierto, y se le sumaron dos
> pendientes nuevos que salieron de ese mismo deploy: el token de tareas
> programadas commiteado (ver abajo) y el redirect del módulo 10 (v2.0.19).

El conector MCP de Base44 **no estaba autorizado en esa sesión**, así que no se
pudo desplegar nada en su momento. Por orden de importancia:

1. **`npm run deploy:site`** — el hueco del 2026-09-07 sigue abierto y ya son
   **9 días** de `Production smoke test` en rojo (runs #12 a #21), siempre
   porque `[data-theme-switcher]` no aparece en producción aunque
   `ThemeSwitcher` se monte sin condición en `src/App.jsx`. Confirma con un
   `workflow_dispatch` de la suite. Si tras un deploy real sigue faltando, deja
   de ser un hueco de despliegue y pasa a ser un bug de producto.
2. **`npm run deploy`** — las 14 funciones tocadas y la nueva
   `purgeStaleSessions`. Hasta entonces el módulo 22 está en el repo y no en
   producción.
3. **`npm run deploy:entities`** — las descripciones del módulo 19 son metadata
   de esquema: viven en el `.jsonc` y no llegan a producción sin esto. Ojo, es
   el comando destructivo; pide escribir "Puntos+".
4. **Dar de alta `purgeStaleSessions` en el panel de tareas programadas de
   Base44.** Desplegar la función no la agenda. Diaria basta. Y comprueba que
   `SCHEDULED_TASK_SECRET` esté puesto: sin él responde 403 y no corre — que es
   la dirección segura del fallo, pero sigue siendo no correr.

**Nada de lo de esta versión se abrió en un navegador**: no hay sesión de
Base44 en este entorno. Eso incluye `About`, los dos diálogos de sesión y la
lista de dispositivos. Lo que sí se comprobó está en `CHANGELOG.md` (2.0.18),
incluido un `deno check` de las 14 funciones **contra una línea base de
`HEAD`** — el conteo de errores bajó o quedó igual en todas, ninguna subió.


## Módulo 10 — el redirect que tumbaba la app para los anónimos (2026-09-10, v2.0.19)

Diez sitios llamaban a `base44.auth.redirectToLogin()`, que manda al `/login`
en minúsculas de la plataforma. Todo visitante **sin sesión** en `/` salía de la
app antes de que React montara. Nueve días de smoke rojo salieron de aquí, no
de un hueco de despliegue. `src/lib/goToLogin.js` es ahora el único dueño de esa
navegación; el único `redirectToLogin` que queda es el de `ContinueAs.jsx`, que
lo necesita.

**El patrón que se repite en este repo, y ya van cuatro:** el arreglo del módulo
10 estaba aplicado en un sitio, con un comentario largo dándolo por cerrado,
mientras diez seguían rotos. Igual que el módulo 22 (`auth.me()` cacheado en 13
funciones), igual que `check:secrets` (una regla que no ve JSON), igual que
«Deno no puede importar entre directorios». **Un arreglo con un comentario que
dice "arreglado" no es una garantía: la garantía es un grep o un test.** Cuando
cierres un módulo, cuenta los sitios.

## Un secreto vivo estaba commiteado — y el guardia no podía verlo (2026-09-10)

`base44/workflows/*.jsonc` (los 4, desde `31b97f7`, 2026-09-06) llevaban
`"scheduled_token": "re_QaaB…"` en claro: el valor de `SCHEDULED_TASK_SECRET`,
lo único que protege las cuatro funciones programadas — dos de las cuales mandan
correo a **todas** las cuentas. Rotado el 2026-09-09.

**`npm run check:secrets` pasaba en verde, y no por poco:** su regla
`HARDCODED` es `\b(secret|api_key|…)\b\s*[:=]`, y en JSON la clave lleva una
comilla de cierre antes de los dos puntos, que `\s*` no cruza. Comprobado:

    JS   clave sin comillas    secret: "…"     ->  true
    JSON clave con comillas   "secret": "…"    ->  false

O sea que **nunca ha podido detectar nada en un `.json` ni en un `.jsonc`** —
el formato de las 19 entidades y de los 4 workflows. No es que faltara
`scheduled_token` en la lista de palabras: `"secret"` tampoco casa.

Pendientes de esto:

1. Los 4 workflows en el panel siguen con el token viejo → los crons responden
   403 hasta que se actualicen. **El CLI no sirve para esto**: `base44
   workflows` sólo tiene `list` y `runs`, no hay `push`. Es a mano en el panel.
2. Decidir si el panel admite una *referencia* al secreto o sólo un literal. Si
   sólo admite literal, `base44/workflows/` debe ir a `.gitignore`, porque cada
   exportación vuelve a meter el secreto en git.
3. Arreglar `check-secrets.mjs` para que vea JSON. **Ojo con el orden:** en
   cuanto vea JSON, fallará sobre el token que sigue commiteado — correcto, pero
   pone `main` en rojo. Primero saca el token, después arregla el guardia.
4. `purgeStaleSessions` sigue sin su workflow, así que la capa 3 del módulo 20
   no corre todavía.
