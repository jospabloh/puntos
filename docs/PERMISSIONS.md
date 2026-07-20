# Puntos+ — Roles & Permissions Matrix

Version: 2.0.9 | Updated: 2026-07-20

Puntos+ is a **multi-tenant SaaS**. The capability matrix below is the canonical
contract; it is mirrored in code at `src/lib/rbac.js` (`PERMISSIONS`) and rendered
in-app at `/Permissions`. When you add a capability, add it in **both** places
with the narrowest safe default.

---

## Tiers (roles)

| App role | Base44 `role` (RLS) | Scope | Description |
|----------|---------------------|-------|-------------|
| **owner** | `admin` | Cross-tenant (all businesses) + service-role | Platform owner (ACACIA). Manages tenants, licenses, and the support console. |
| **business_admin** | `business_admin` | One tenant (`business_id`) | Tenant owner/admin. Manages stores, team, customers, campaigns, billing, support. |
| **staff** | `merchant` | One store/tenant (`storeId` / `business_id`) | Cashier/operator. Point of sale only. |
| **customer** | `customer` (legacy `user`) | Own account (`user_id`) | End consumer. Wallet, offers, history, redemptions. |

Role is resolved by `getAppRole(user)` in `src/lib/rbac.js`. The **owner is the
super-tier** — `can(owner, …)` is always `true`. Per-tenant overrides may be
stored in the `PermissionProfile` entity (consumed by `can(user, key, override)`).

> Backward compatibility: legacy customers carry Base44 `role: 'user'`; `getAppRole`
> treats `'user'` as `customer`. Legacy merchants carry `role: 'merchant'` and/or
> `merchant_role: 'merchant'`; both resolve to `staff`.

---

## Capability matrix

✅ = allowed by default · — = denied. Owner holds every capability implicitly.

### Platform (owner only)
| Capability | owner | business_admin | staff | customer |
|---|---|---|---|---|
| `platform:view_console` | ✅ | — | — | — |
| `tenants:view` / `:create` / `:update` / `:suspend` / `:delete` | ✅ | — | — | — |
| `licenses:view` / `:assign` / `:activate` | ✅ | — | — | — |
| `support:view_console` / `:reply_all` / `:internal_note` | ✅ | — | — | — |
| `platform:impersonate` | ✅ | — | — | — |

### Tenant administration
| Capability | owner | business_admin | staff | customer |
|---|---|---|---|---|
| `business:view` / `:update_settings` / `:view_billing` / `:request_upgrade` | ✅ | ✅ | — | — |
| `users:view` / `:invite` / `:update_role` / `:remove` | ✅ | ✅ | — | — |
| `stores:view` | ✅ | ✅ | ✅ | — |
| `stores:create` / `:update` / `:delete` | ✅ | ✅ | — | — |
| `campaigns:view` / `:manage` | ✅ | ✅ | — | — |
| `offers:view` | ✅ | ✅ | ✅ | ✅ |
| `offers:manage` | ✅ | ✅ | — | — |
| `customers:view` / `:adjust_points` / `:export` | ✅ | ✅ | — | — |
| `audit:view` | ✅ | ✅ | — | — |
| `analytics:view` | ✅ | ✅ | — | — |

### Point of sale
| Capability | owner | business_admin | staff | customer |
|---|---|---|---|---|
| `pos:access` / `pos:earn` / `pos:burn` | ✅ | ✅ | ✅¹ | — |

¹ Staff (`merchant`) are pinned to their assigned store: the POS store selector
shows only that store, and the `earnPoints` / `burnPoints` functions reject
operations on any other store. Owner and `business_admin` may operate any store
in the business.

### Support (tenant side)
| Capability | owner | business_admin | staff | customer |
|---|---|---|---|---|
| `support:create_ticket` / `:view_own_tickets` / `:reply_own` | ✅ | ✅ | — | — |

### Customer-facing
| Capability | owner | business_admin | staff | customer |
|---|---|---|---|---|
| `wallet:view` / `wallet:generate_pass` | ✅ | ✅ | ✅ | ✅ |
| `rewards:redeem` | ✅ | — | — | ✅ |
| `history:view_own` / `chat:use` / `profile:edit_own` | ✅ | ✅ | ✅ | ✅ |

---

## Route / page access

Enforced client-side by `useRequirePage(pageName)` (`src/lib/useCurrentUser.js`)
against `PAGE_ACCESS` in `src/lib/rbac.js`. The authoritative enforcement is
Base44 **RLS at the data layer** (below).

| Page | owner | business_admin | staff | customer |
|------|:---:|:---:|:---:|:---:|
| PlatformDashboard / PlatformTenants / PlatformLicenses / PlatformSupport | ✅ | — | — | — |
| AdminDashboard / AdminStores / AdminCampaigns / AdminCustomers / AdminAudit | ✅ | ✅ | — | — |
| BusinessSettings / BusinessUsers / BusinessBilling / BusinessSupport | ✅ | ✅ | — | — |
| MerchantPOS | ✅ | ✅ | ✅ | — |
| Permissions | ✅ | ✅ | ✅ | ✅ |
| Home / Wallet / Offers / History / Chat / Profile | ✅ | ✅ | ✅ | ✅ |
| Onboarding | (no-layout; routes by chosen path / invitation) |

The back-office (owner + business_admin pages) renders inside a **sidebar shell**;
staff/customers get the consumer top/bottom nav. See `src/Layout.jsx`.

---

## Entity / data access (RLS)

All entities live in `base44/entities/*.jsonc` and are deployed to the Base44
backend. The multi-tenant isolation strategy and its two-halves gotcha are
documented in `CLAUDE.md`. Summary of effective access:

| Entity | owner | business_admin | staff | customer | Isolation key |
|--------|-------|----------------|-------|----------|---------------|
| `Business` | all | own (`id == business_id`) | — | — | `id` |
| `PermissionProfile` | all | own tenant | read own tenant | read own tenant | `data.business_id` |
| `SupportTicket` / `SupportTicketMessage` | all | own tenant | — | — | `data.business_id` (+ `is_internal_note=false` for tenant) |
| `LicenseEvent` | all | read own tenant | — | — | `data.business_id` |
| `Invitation` | all | own tenant | own email | own email | `data.business_id` / `data.email` |
| `LoyaltyAccount` | all | own tenant | own store/tenant | own (`user_id`) | `data.business_id` / `data.store_id` / `data.user_id` |
| `PointsLedger` | all | own tenant | own store/tenant | own (`user_id`) | `data.business_id` / `data.store_id` |
| `Store` | all | own tenant | active + own tenant | active (join) | `data.business_id` / `data.status` |
| `Campaign` / `Offer` | all | own tenant | active | active | `data.business_id` / `data.status` |
| `Redemption` | all | own tenant | own store/tenant | own (`user_id`) | `data.business_id` / `data.store_id` |
| `AuditLog` | all | own tenant | own store | own / targeted | `data.business_id` / `data.store_id` |
| `ChatConversation` | all | own tenant | — | own (`user_id`) | `data.user_id` / `data.business_id` |
| `NotificationPreference` | all | — | — | own (`user_id`) | `data.user_id` |

**Field-level RLS** on `LoyaltyAccount` restricts financial/identity fields
(`current_balance`, `lifetime_*`, `tier`, `status`, `subscription_*`, `trial_*`,
`store_*`, `business_*`, `user_*`) to `admin` / `merchant` / `business_admin`;
all balance writes happen only server-side — customer redemption via
`redeemOffer` / `createLoyaltyAccount`, and POS accumulate/redeem via
`earnPoints` / `burnPoints`. The merchant POS no longer writes balances from the
browser.

**Field-level RLS** on `User` restricts the privilege fields (`role`, `app_role`,
`business_id`, `business_name`, `storeId`, `store_id`, `store_name`,
`merchant_role`) to service-role (`admin`) writes. Users cannot self-assign a role
or tenant via `auth.updateMe`; all role/tenant changes flow through
`createBusiness`, `createLoyaltyAccount`, `acceptInvitation`, and
`manageTeamMember`. (Self-service fields like `phone` stay user-writable.)

---

## License plans (feature gating)

Defined in `src/lib/licensePlans.js` and gated via `planHasFeature` / `checkLimit`.

| | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Precio / mes | Gratis | $899 | $2,490 | Contáctanos |
| Tiendas | 1 | 5 | 25 | ∞ |
| Usuarios equipo | 2 | 10 | 50 | ∞ |
| Clientes | 250 | 5,000 | 50,000 | ∞ |
| Campañas | — | ✅ | ✅ | ✅ |
| Wallet passes | — | ✅ | ✅ | ✅ |
| Analítica avanzada | — | ✅ | ✅ | ✅ |
| Referidos | — | ✅ | ✅ | ✅ |
| Asistente IA | — | — | ✅ | ✅ |
| API / Soporte prioritario | — | — | ✅ | ✅ |

Billing lifecycle (`Business.billing_status`): `trial → active → view_only →
suspended → archived`, derived to UI banners by `deriveLicense()` in
`src/lib/useTenant.js`. Every transition is recorded as a `LicenseEvent`.

---

## Serverless functions

| Function | Caller | Auth | Purpose |
|----------|--------|------|---------|
| `createBusiness` | any authed | `auth.me()` → 401 | Provision a tenant (Business + first Store + owner account + LicenseEvent) with server-enforced safe values, and promote the caller to `business_admin` (service role). Required because `Business.create` is admin-only. |
| `createStore` | any authed | `auth.me()` → 401 | Add a store to the caller's tenant with a server-generated globally-unique code. Platform owner may specify a target `business_id`. |
| `createLoyaltyAccount` | any authed | `auth.me()` → 401 | Create caller's account (balance 0). Stamps `business_id` from the store/owner context, and sets the caller's `customer` role server-side (service role). |
| `acceptInvitation` | any authed | `auth.me()` → 401 | Accept a pending team invitation addressed to the caller's email. Assigns `business_admin`/`merchant` + tenant/store from the invitation (service role). Never grants `admin`. Replaces client `auth.updateMe` role-setting. |
| `manageTeamMember` | owner / `business_admin` | `auth.me()` → 401, tenant gate → 403 | Set a team member's role/store or remove them, within the actor's tenant. Roles limited to `business_admin`/`merchant`/`customer` — never `admin`. Replaces client `User.update`. |
| `redeemOffer` | any authed | `auth.me()` → 401 | Server-side offer redemption (atomic balance). |
| `earnPoints` | operator (`admin` / `business_admin` / `merchant`) | `auth.me()` → 401, role gate → 403 | POS accumulate. Computes points & new balance server-side from the store's rate (client never supplies the balance). Staff are pinned to their assigned store. |
| `burnPoints` | operator (`admin` / `business_admin` / `merchant`) | `auth.me()` → 401, role gate → 403 | POS redeem. Server-side balance check & deduction. Staff are pinned to their assigned store. |
| `getAppContext` | any authed | `auth.me()` → unauthenticated empty | Resolve platform context (owner flag, support email). Self-heals owner role to `admin` if email matches `APP_OWNER_EMAIL` (server-side secret gate). |
| `createGoogleWalletPass` / `createAppleWalletPass` | any authed | `auth.me()` → 401 | Wallet passes. Apple pass advertises the PassKit web service when configured. |
| `passkitWebService` | Apple device | pass `authenticationToken` (HMAC) | Apple PassKit web service: device register/unregister, list-updatable, serve-latest-pass (service role). |
| `updateWalletPasses` | `admin` | role gate | Scheduled: Google Wallet balance push + token-based APNs push to registered Apple devices. |
| `acaciaControl` | ACACIA Mission Control | HMAC-SHA256 (`INGEST_HMAC_SECRET`) | Admin bridge for Mission Control reads (usage, licenses, contacts, tickets) and writes (license sync, ticket replies, follow-up emails). Replay-protected (5-min timestamp window). |
| `checkTrialExpiration` / `regenerateExpiredQR` / `sendWeeklySummary` / `cleanupInactiveUsers` | `admin` | role gate | Scheduled jobs. |

---

## Adding a capability or page (checklist)

1. Add the `module:action` key to `PERMISSIONS` in `src/lib/rbac.js` with the
   narrowest default role list.
2. If it's a page, add it to `PAGE_ACCESS` and register it in `src/pages.config.js`.
3. If it reads/writes a new field or entity, update the entity `.jsonc` RLS using
   the patterns in `CLAUDE.md`, run `npm run validate:rls`, and **deploy** the
   schema to Base44 (`update_entity_schema`).
4. Update this matrix and the `/Permissions` page renders it automatically.
