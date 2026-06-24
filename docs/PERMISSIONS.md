# Puntos+ — Roles & Permissions Matrix

Version: 2.0.0 | Updated: 2026-06-24

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
| `pos:access` / `pos:earn` / `pos:burn` | ✅ | ✅ | ✅ | — |

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
customer balance writes happen only server-side (`redeemOffer`,
`createLoyaltyAccount`).

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
| `createBusiness` | any authed | `auth.me()` → 401 | Provision a tenant (Business + first Store + owner account + LicenseEvent) with server-enforced safe values. Required because `Business.create` is admin-only. |
| `createLoyaltyAccount` | any authed | `auth.me()` → 401 | Create caller's account (balance 0). Stamps `business_id` from the store/owner context (service role). |
| `redeemOffer` | any authed | `auth.me()` → 401 | Server-side offer redemption (atomic balance). |
| `createGoogleWalletPass` / `createAppleWalletPass` | any authed | `auth.me()` → 401 | Wallet passes. Apple pass advertises the PassKit web service when configured. |
| `passkitWebService` | Apple device | pass `authenticationToken` (HMAC) | Apple PassKit web service: device register/unregister, list-updatable, serve-latest-pass (service role). |
| `updateWalletPasses` | `admin` | role gate | Scheduled: Google Wallet balance push + token-based APNs push to registered Apple devices. |
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
