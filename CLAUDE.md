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
      `validate:rls` (18 entities).
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

Last audited against the standard: 2026-08-21 — module 3 had no server-side
enforcement at all and module 1 allowed license self-escalation; both closed
in this pass.

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
