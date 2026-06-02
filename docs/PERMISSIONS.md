# Puntos+ — Roles and Permissions Matrix

Version: 1.4.0 | Updated: 2026-06-02

---

## Roles

| Role | Description | How Assigned |
|------|-------------|--------------|
| `admin` | Full access to admin panel, all data, all operations | Set via `base44.auth.updateMe` or directly in auth system |
| `merchant` | Access to POS; can earn/burn points for customers of active stores | Set during merchant onboarding |
| `user` (customer) | Access to own wallet, history, offers | Set during customer onboarding |
| (unauthenticated) | Public pages only; redirected to login | Default before login |

**Admin defaults:** All admin capabilities are `true` by default.  
**Member/merchant defaults:** All capabilities not listed as `true` default to `false`.  
**New features** must be added to this matrix before release with safe defaults.

---

## Route / Page Access

| Page | Route | admin | merchant | customer | Enforcement File | Enforcement Method |
|------|-------|-------|----------|----------|------------------|--------------------|
| Home | `/Home` | ✅ | ✅ | ✅ | `Home.jsx` | Redirects to login if no auth |
| Wallet | `/Wallet` | ✅ | ✅ | ✅ | `Wallet.jsx` | Redirects to login if no auth |
| Offers | `/Offers` | ✅ | ✅ | ✅ | `Offers.jsx` | Redirects to login if no auth |
| History | `/History` | ✅ | ✅ | ✅ | `History.jsx` | Redirects to login if no auth |
| Chat | `/Chat` | ✅ | ✅ | ✅ | `Chat.jsx` | Redirects to login if no auth |
| Profile | `/Profile` | ✅ | ✅ | ✅ | `Profile.jsx` | Redirects to login if no auth |
| Onboarding | `/Onboarding` | ✅ | ✅ | ✅ | `Onboarding.jsx` | Redirects completed accounts to Home |
| MerchantPOS | `/MerchantPOS` | ✅ | ✅ | ❌ | `MerchantPOS.jsx:75` | `role !== 'merchant' && role !== 'admin' && merchant_role !== 'merchant'` → redirect Home |
| AdminDashboard | `/AdminDashboard` | ✅ | ❌ | ❌ | `AdminDashboard.jsx:59` | `role !== 'admin'` → redirect Home |
| AdminStores | `/AdminStores` | ✅ | ❌ | ❌ | `AdminStores.jsx:71` | `role !== 'admin'` → redirect Home |
| AdminCampaigns | `/AdminCampaigns` | ✅ | ❌ | ❌ | `AdminCampaigns.jsx:91` | `role !== 'admin'` → redirect Home |
| AdminCustomers | `/AdminCustomers` | ✅ | ❌ | ❌ | `AdminCustomers.jsx:82` | `role !== 'admin'` → redirect Home |
| AdminAudit | `/AdminAudit` | ✅ | ❌ | ❌ | `AdminAudit.jsx:72` | `role !== 'admin'` → redirect Home |

**Notes:**
- Route protection is UI-only (client-side redirect). The Base44 platform enforces entity-level access at the data layer via RLS.
- Unauthenticated users are redirected by `base44.auth.redirectToLogin()`.

---

## Entity / Data Access

| Entity | Admin | Merchant | Customer | Isolation Scope | Notes |
|--------|-------|----------|----------|-----------------|-------|
| `LoyaltyAccount` read | ✅ all | ✅ own store only (by `store_id` + `user_email`) | ✅ own account (by `user_email`) | By `user_email` or `store_id` | Admin sees all; merchant filtered in POS search |
| `LoyaltyAccount` write | ✅ | ✅ (balance updates only via POS) | ✅ (QR token refresh, profile) | User-owned | Admin adjust via AdminCustomers |
| `PointsLedger` read | ✅ all | ✅ by `store_id` | ✅ by `account_id` | `account_id` / `store_id` | Customer and merchant filtered at query time |
| `PointsLedger` create | ✅ | ✅ (EARN/BURN) | ❌ | `store_id` required for merchant ops | Idempotency key enforced for EARN |
| `AuditLog` read | ✅ | ❌ | ❌ | None (admin-only) | AdminAudit page |
| `AuditLog` create | ✅ | ✅ (own ops) | ❌ | Actor fields set server-side | Merchant creates for EARN/BURN/ADJUST ops |
| `Store` read | ✅ all | ✅ active stores | ✅ (store name in account) | `status: active` filter | Merchants see all active stores in POS selector |
| `Store` write | ✅ | ❌ | ❌ | Admin only | AdminStores CRUD |
| `Offer` read | ✅ | ✅ | ✅ (active only) | `status: active` filter | All authenticated users |
| `Offer` write | ✅ | ❌ | ❌ | Admin only | AdminCampaigns |
| `Campaign` read | ✅ | ❌ | ❌ | Admin only | |
| `Campaign` write | ✅ | ❌ | ❌ | Admin only | AdminCampaigns |
| `Redemption` read | ✅ | ❌ | ✅ own | `account_id` | Created on offer redemption |
| `Redemption` create | ✅ | ❌ | ✅ | Own account only | Offers.jsx; balance check enforced client-side |
| `NotificationPreference` read | ✅ | ❌ | ✅ own | `user_id` | Profile.jsx |
| `NotificationPreference` write | ✅ | ❌ | ✅ own | `user_id` | Profile.jsx |

---

## Loyalty Points Operations

| Operation | admin | merchant | customer | Permission Key | Enforcement Location |
|-----------|-------|----------|----------|----------------|----------------------|
| Earn points (POS purchase) | ✅ | ✅ | ❌ | `role === 'merchant' or 'admin'` | `MerchantPOS.jsx:75` |
| Burn points (POS redemption) | ✅ | ✅ | ❌ | `role === 'merchant' or 'admin'` | `MerchantPOS.jsx:75` |
| Redeem offer (self) | ✅ | ❌ | ✅ | Authenticated user | `Offers.jsx:119` |
| Manual adjust points | ✅ | ❌ | ❌ | `role === 'admin'` | `AdminCustomers.jsx:82` |
| View own balance | ✅ | ✅ | ✅ | Authenticated | `Home.jsx`, `Wallet.jsx` |
| View all balances | ✅ | ❌ | ❌ | `role === 'admin'` | `AdminCustomers.jsx` |
| View own transaction history | ✅ | ✅ | ✅ | Authenticated + `account_id` filter | `History.jsx` |
| View all transactions | ✅ | ❌ | ❌ | `role === 'admin'` | `AdminDashboard.jsx`, `AdminCustomers.jsx` |

---

## Wallet / Pass Operations

| Operation | admin | merchant | customer | Enforcement |
|-----------|-------|----------|----------|-------------|
| Generate Google Wallet pass | ✅ | — | ✅ | `createGoogleWalletPass`: `base44.auth.me()` check |
| Generate Apple Wallet pass | ✅ | — | ✅ | `createAppleWalletPass`: `base44.auth.me()` check |
| Refresh QR token | ✅ | — | ✅ | Own account only — `LoyaltyAccount.update(account.id)` |
| Auto-regenerate expired QRs | admin/system only | — | — | `regenerateExpiredQR`: `role === 'admin'` |

---

## Serverless Functions

| Function | Caller Required Role | Auth Check | Purpose |
|----------|---------------------|------------|---------|
| `createGoogleWalletPass` | Any authenticated user | `base44.auth.me()` → 401 if missing | Generate Google Wallet JWT for current user |
| `createAppleWalletPass` | Any authenticated user | `base44.auth.me()` → 401 if missing | Generate Apple Wallet .pkpass for current user |
| `checkTrialExpiration` | `admin` | `role !== 'admin'` → 403 | Scheduled: expire/suspend trial accounts |
| `regenerateExpiredQR` | `admin` | `role !== 'admin'` → 403 | Scheduled: refresh expired QR tokens |
| `sendWeeklySummary` | `admin` | `role !== 'admin'` → 403 | Scheduled: send weekly activity emails |
| `cleanupInactiveUsers` | `admin` | `role !== 'admin'` → 403 | Scheduled: send re-engagement emails |
| `updateWalletPasses` | `admin` | `role !== 'admin'` → 403 | Scheduled stub: update wallet pass balances (not yet implemented) |

---

## Navigation / UI Visibility

| UI Element | Shown to admin | Shown to merchant | Shown to customer | Enforcement File |
|------------|---------------|------------------|------------------|------------------|
| Admin nav items (Dashboard, Stores, Campaigns, Customers, Audit) | ✅ | ❌ | ❌ | `Layout.jsx:46-47` |
| POS nav link | ✅ | ✅ | ❌ | `Layout.jsx:47` |
| Customer nav (Home, Wallet, Offers, History, Chat) | ✅ | ✅ | ✅ | `Layout.jsx:50-56` |
| "Admin" button in header | ✅ | ❌ | ❌ | `Layout.jsx:153` |
| "POS" button in header | ✅ | ✅ | ❌ | `Layout.jsx:158` |
| Trial banner | — | ✅ (trial only) | — | `Home.jsx`, `Wallet.jsx`, `History.jsx`, `MerchantPOS.jsx` |
| Suspended account modal | — | ✅ (suspended) | — | `Home.jsx`, `Wallet.jsx`, `History.jsx`, `Offers.jsx` |

---

## Permission Gaps and Open Items

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| G-1 | Medium | Merchants can see and transact for any active store (not restricted to their own) | Open — by design (single-program model), but should be documented |
| G-2 | Medium | Client-side balance calculation race condition for concurrent transactions | Open — platform limitation |
| G-3 | Medium | BURN idempotency uses `Date.now()`; rapid duplicate calls are possible within the same millisecond | Open |
| G-4 | Low | Route access is enforced only client-side; Base44 RLS is the actual data-layer enforcement | Acceptable — Base44 platform handles data layer |
| G-5 | Low | Hardcoded admin notification email in `checkTrialExpiration` and `Onboarding` | Open — move to env variable |

---

## Admin Onboarding Checklist

When adding a new admin user:
1. Set `role: 'admin'` in the authentication system.
2. Verify the user can access `/AdminDashboard`.
3. Confirm the user cannot access data from outside the program scope.
4. Review `AuditLog` for any unexpected admin actions.

When adding a new merchant user:
1. Complete merchant onboarding (creates Store and LoyaltyAccount with trial).
2. Verify `role: 'merchant'` is set.
3. Verify the merchant can access `/MerchantPOS`.
4. Confirm the trial end date is set correctly in `LoyaltyAccount`.

When adding a new customer:
1. Complete customer onboarding with a valid store code.
2. Verify `role: 'user'` is set and `onboarding_completed: true`.
3. Verify a `LoyaltyAccount` record exists with `store_id` populated.
