# Puntos+ — Permissions Reference

**Version 1.3.0 · June 2026**

This document describes the Role-Based Access Control (RBAC) model for Puntos+ and the Row-Level Security (RLS) rules applied to every entity.

---

## Roles

| Role | Who | Default access |
|------|-----|---------------|
| **admin** | Platform operators | All permissions: **true** |
| **merchant** | Store operators | Scoped to their assigned store; all others: **false** |
| **member** (customer) | End users / loyalty members | Own data only; all others: **false** |

> **Principle of least privilege:** `member` and `merchant` roles start with all permissions set to **false**. Admins explicitly grant access by assigning the appropriate role or adjusting entity RLS rules.

---

## Role Assignment

Only **admins** can change a user's role. Role changes take effect immediately on the next API call.

---

## Entity Permissions Matrix

### LoyaltyAccount

| Operation | Admin | Merchant | Member |
|-----------|-------|----------|--------|
| Create | ✅ | ❌ | ✅ (own account only) |
| Read | ✅ (all) | ✅ (own store customers) | ✅ (own account) |
| Update | ✅ (all) | ❌ | ✅ (own account) |
| Delete | ✅ | ❌ | ❌ |

**RLS detail:**
- Create: `data.user_id == user.id`
- Read: admin OR `data.user_id == user.id` OR (merchant AND `data.store_id == user.data.storeId`)
- Update: admin OR `data.user_id == user.id`
- Delete: admin only

---

### PointsLedger

| Operation | Admin | Merchant | Member |
|-----------|-------|----------|--------|
| Create | ✅ | ✅ (own store transactions) | ❌ |
| Read | ✅ (all) | ✅ (own store) | ✅ (own records) |
| Update | ✅ | ❌ | ❌ |
| Delete | ✅ | ❌ | ❌ |

**RLS detail:**
- Create: admin OR (merchant AND `data.operator_id == user.id` AND `data.store_id == user.data.storeId`)
- Read: admin OR `data.user_id == user.id` OR (merchant AND `data.store_id == user.data.storeId`)
- Update/Delete: admin only

---

### Store

| Operation | Admin | Merchant | Member |
|-----------|-------|----------|--------|
| Create | ✅ | ❌ | ❌ |
| Read | ✅ (all) | ✅ (own store + all active) | ✅ (active stores only) |
| Update | ✅ | ✅ (own store) | ❌ |
| Delete | ✅ | ❌ | ❌ |

**RLS detail:**
- Create: admin only
- Read: admin OR `data.status == 'active'` OR `data.merchant_id == user.id`
- Update: admin OR `data.merchant_id == user.id`
- Delete: admin only

---

### Campaign

| Operation | Admin | Merchant | Member |
|-----------|-------|----------|--------|
| Create | ✅ | ❌ | ❌ |
| Read | ✅ (all) | ✅ (active only) | ✅ (active only) |
| Update | ✅ | ❌ | ❌ |
| Delete | ✅ | ❌ | ❌ |

**RLS detail:**
- Read: admin OR `data.status == 'active'`
- All writes: admin only

---

### Offer

| Operation | Admin | Merchant | Member |
|-----------|-------|----------|--------|
| Create | ✅ | ❌ | ❌ |
| Read | ✅ (all) | ✅ (active only) | ✅ (active only) |
| Update | ✅ | ❌ | ❌ |
| Delete | ✅ | ❌ | ❌ |

**RLS detail:**
- Read: admin OR `data.status == 'active'`
- All writes: admin only

---

### Redemption

| Operation | Admin | Merchant | Member |
|-----------|-------|----------|--------|
| Create | ✅ | ❌ | ✅ (own redemptions) |
| Read | ✅ (all) | ❌ | ✅ (own redemptions) |
| Update | ✅ | ✅ (own store) | ❌ |
| Delete | ✅ | ❌ | ❌ |

**RLS detail:**
- Create: admin OR `data.user_id == user.id`
- Read: admin OR `data.user_id == user.id`
- Update: admin OR (merchant AND `data.store_id == user.data.storeId`)
- Delete: admin only

---

### AuditLog *(updated v1.3.0)*

| Operation | Admin | Merchant | Member |
|-----------|-------|----------|--------|
| Create | ✅ | ✅ (own store entries) | ❌ |
| Read | ✅ (all) | ✅ (own entries) | ✅ (own entries as actor/target) |
| Update | ✅ | ❌ | ❌ |
| Delete | ✅ | ❌ | ❌ |

**RLS detail:**
- Create: admin OR (merchant AND `data.actor_id == user.id` AND `data.store_id == user.data.storeId`)
- Read: admin OR `data.actor_id == user.id` OR `data.target_user_id == user.id`
- Update/Delete: admin only

> **Change in v1.3.0:** Merchants can now create AuditLog entries scoped to their store. Previously this was incorrectly admin-only, causing all merchant POS audit logs to be silently dropped.

---

### ChatConversation

| Operation | Admin | Merchant | Member |
|-----------|-------|----------|--------|
| Create | ✅ | ❌ | ✅ (own conversations) |
| Read | ✅ (all) | ❌ | ✅ (own conversations) |
| Update | ✅ | ❌ | ✅ (own conversations) |
| Delete | ✅ | ❌ | ❌ |

**RLS detail:**
- Create/Update: admin OR `data.user_id == user.id`
- Read: admin OR `data.user_id == user.id`
- Delete: admin only

---

### NotificationPreference

| Operation | Admin | Merchant | Member |
|-----------|-------|----------|--------|
| Create | ✅ | ❌ | ✅ (own prefs) |
| Read | ✅ (all) | ❌ | ✅ (own prefs) |
| Update | ✅ | ❌ | ✅ (own prefs) |
| Delete | ✅ | ❌ | ❌ |

**RLS detail:**
- Create/Update: admin OR `data.user_id == user.id`
- Read: admin OR `data.user_id == user.id`
- Delete: admin only

---

## Serverless Function Permissions

All scheduled/admin serverless functions require `role == 'admin'` to execute. They additionally use `base44.asServiceRole` for privileged data operations.

| Function | Required Role | Notes |
|----------|--------------|-------|
| `checkTrialExpiration` | admin | Scheduled task; auto-suspends inactive accounts |
| `cleanupInactiveUsers` | admin | Sends re-engagement emails |
| `regenerateExpiredQR` | admin | Scheduled task; refreshes QR tokens |
| `sendWeeklySummary` | admin | Scheduled task; sends activity digests |
| `updateWalletPasses` | admin | Scheduled task; sync wallet balances |
| `createGoogleWalletPass` | any authenticated user | Scoped to requesting user's own account |
| `createAppleWalletPass` | any authenticated user | Scoped to requesting user's own account |

---

## Granting Access — Admin Checklist

When onboarding a new merchant:
1. Set user `role` to `merchant` in Base44 user management.
2. Set `user.data.storeId` to the ID of the store they operate.
3. Verify the `Store` record exists with `status: active` and the correct `merchant_id`.

When onboarding a new member:
1. Member self-registers; a `LoyaltyAccount` is created automatically via the onboarding flow.
2. Members have no additional configuration required — all access is self-scoped.
3. If a member should be associated with a specific store, set `store_id` on their `LoyaltyAccount`.

---

## Security Notes

- All RLS rules are enforced server-side by the Base44 platform.
- Client-side role checks (e.g., in `MerchantPOS.jsx`) are a UX convenience only and are **not** a security boundary.
- Service-role operations (`base44.asServiceRole`) bypass RLS and are restricted to scheduled serverless functions; they are never called from the frontend.
- QR tokens are cryptographically random (as of v1.3.0) and expire after 5 minutes.
