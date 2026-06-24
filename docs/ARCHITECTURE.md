# Puntos+ — Architecture (v2.0.0, multi-tenant)

## Tenancy model

```
Platform Owner (ACACIA, role: admin)
   │  manages licenses, tenants, support
   ▼
Business  ── tenant ──┐ (license_plan, billing_status, limits, invite_code)
   ├── Stores         │
   ├── Team (Users: business_admin / staff)
   ├── Campaigns / Offers
   ├── Customers (LoyaltyAccount + PointsLedger)
   └── SupportTickets ──► Owner support console
```

- **Tenant = `Business`**. Every tenant-owned record carries `business_id`.
- A **customer** can belong to a tenant (via the store they joined) and only ever
  sees their own account.
- The **owner** is cross-tenant and is also the service-role tier.

## Layers

| Concern | Where |
|---|---|
| Roles & capability matrix | `src/lib/rbac.js` (`getAppRole`, `PERMISSIONS`, `can`, `PAGE_ACCESS`) |
| License catalog & gating | `src/lib/licensePlans.js` (`LICENSE_PLANS`, `planHasFeature`, `checkLimit`) |
| Tenant context & license lifecycle | `src/lib/useTenant.js` (`useTenant`, `deriveLicense`) |
| Current user + page guard | `src/lib/useCurrentUser.js` (`useCurrentUser`, `useRequirePage`) |
| Navigation shell (4 tiers) | `src/Layout.jsx` (sidebar for back-office, top/bottom nav for consumer) |
| Back-office UI kit | `src/components/backoffice/Kit.jsx` |
| Data models + RLS | `base44/entities/*.jsonc` (deployed to Base44) |
| Server-side safe ops | `base44/functions/*/entry.ts` |

## Entities (16)

**New for multi-tenancy:** `Business`, `PermissionProfile`, `SupportTicket`,
`SupportTicketMessage`, `LicenseEvent`, `Invitation`.

**Extended with `business_id` + tenant RLS:** `LoyaltyAccount`, `PointsLedger`,
`Store`, `Campaign`, `Offer`, `Redemption`, `AuditLog`, `ChatConversation`,
`NotificationPreference`, `User`.

## Key flows

### Onboarding (`src/pages/Onboarding.jsx`)
1. **Invitation** — if a `pending` `Invitation` exists for the user's email, a
   one-tap join sets their role (`business_admin`/`merchant`) + `business_id`.
2. **Business** — registers a `Business` (30-day Starter trial), creates the first
   `Store`, promotes the user to `business_admin`, writes a `trial_started`
   `LicenseEvent`.
3. **Customer** — joins by store code; the service-role `createLoyaltyAccount`
   stamps `business_id` from the store.

### License lifecycle
`Business.billing_status`: `trial → active → view_only → suspended → archived`.
`deriveLicense(business)` turns dates/status into UI banners and a `canWrite` flag
(view-only/suspended/archived tenants are read-only). Owner changes plans/status
in `PlatformTenants` / `PlatformLicenses`; each change writes a `LicenseEvent`.

### Support
Tenant raises a `SupportTicket` (`BusinessSupport`) → threaded
`SupportTicketMessage`s. Owner triages/answers in `PlatformSupport`, with
**internal notes** (`is_internal_note=true`) hidden from the tenant by RLS.

## Security posture

- Authoritative access control is **Base44 RLS**; client guards are UX only.
- Tenant isolation via `business_id` + role-gated `$or` branches; service-role
  `admin` branch preserved on all ops (see `CLAUDE.md`).
- Field-level RLS protects `LoyaltyAccount` financial fields; balances are written
  only server-side.
- `npm run validate:rls` guards RLS path correctness in CI.

## Competitive differentiators vs. single-program loyalty apps

- True multi-tenant SaaS with self-serve onboarding and 30-day trial.
- Tiered licensing (Starter→Enterprise) with hard limits + feature gating.
- Owner control plane: tenant CRUD, license activation/renewal, revenue view.
- Two-sided support desk (owner console + tenant follow-up with satisfaction).
- Transparent, code-backed permissions matrix surfaced in-app.
- Per-tenant branding (logo/primary color) and team management with seat limits.
