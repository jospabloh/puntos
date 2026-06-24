# Runbook — Multi-tenant (v2.0.0) schema deployment

This documents the Base44 schema deploy performed for the multi-tenant upgrade and
how to re-apply it (e.g. to a staging app). The strategy is **additive-only**: no
existing RLS branch was removed, so no live access narrowed.

## Order of operations (already executed on app `696e7fdd…`)

1. **Create new entities** (pure additive — nothing reads them yet, zero risk):
   `Business`, `PermissionProfile`, `SupportTicket`, `SupportTicketMessage`,
   `LicenseEvent`, `Invitation`. Source of truth: `base44/entities/<Name>.jsonc`.
2. **Update the `User` schema** to add the role enum
   (`admin|business_admin|merchant|customer|user`) and tenant fields
   (`business_id`, `app_role`, `storeId`, `store_id`, `store_name`, …).
3. **Update existing entities** to add `business_id`/`business_name` and the
   additive tenant RLS branches (owner `admin` branch preserved on every op):
   `LoyaltyAccount` (incl. field-level write rules → add `business_admin`),
   `PointsLedger`, `Store`, `Campaign`, `Offer`, `Redemption`, `AuditLog`,
   `ChatConversation`, `NotificationPreference`.
4. **Deploy the updated `createLoyaltyAccount` function** so customer accounts are
   stamped with `business_id` (service role can write the restricted field).

> Each `update_entity_schema` call must send the **full** property set (omitted
> fields are removed). Per-field and entity-level `rls` are preserved when omitted,
> so include them explicitly when changing them.

## Why additive-only is safe on a live app

- Existing branches kept: owner (`role: admin`), customer self (`data.user_id ==
  {{user.id}}`), staff store (`data.store_id == {{user.data.storeId}}`).
- New branches gate on `role: business_admin` / `data.business_id ==
  {{user.data.business_id}}` — no legacy user/record carries these yet, so the new
  clauses match nothing until data is populated. Net effect at deploy time: **no
  access changes** for anyone; capability only widens as tenants are created.

## Verification

```bash
npm run validate:rls    # static RLS path guard (CI)
npm run build           # production build must pass
npm run lint            # 0 errors
```

Then in Base44, `list_entity_schemas` should show 16 entities, each business-scoped
entity carrying the `admin` `$or` branch on all four ops.

## Rollback

New entities are additive and can be ignored/removed without affecting legacy flows.
For existing entities, re-applying the previous `.jsonc` (pre-`business_id`) RLS
would restore prior behavior — but since the change only **added** branches,
rollback is generally unnecessary.

## Post-deploy data notes

- Legacy `LoyaltyAccount`/`Store`/etc. rows have no `business_id`; they remain
  accessible via the preserved legacy branches (owner all; customer own; staff by
  store). They will not appear in a tenant admin's `business_id`-scoped lists until
  back-filled. Back-fill is optional and can be scripted by the owner via the
  service role.
