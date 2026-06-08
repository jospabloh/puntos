# Runbook — LoyaltyAccount field-level RLS (v1.4.5)

This change closes the critical hole where a normal user (`role: user`) could
alter their own `current_balance` / financial fields via a direct
`LoyaltyAccount` update, because point balances were written client-side.

It has **two parts that must be deployed in order**:

1. **Code (this PR):** the `redeemOffer` and `createLoyaltyAccount` serverless
   functions, plus the `Offers.jsx` / `Onboarding.jsx` changes that call them
   instead of writing balances/financial fields from the browser.
2. **Schema (manual step, applied via Base44 after the code is live):**
   field-level RLS (`rls.write`) on `LoyaltyAccount`.

## ⚠️ Ordering matters

Applying the schema RLS **before** the functions are deployed will break live
**onboarding** and **offer redemption** (the old client writes those fields
directly and would be denied). Apply the schema change **only after** this PR
is merged and the two functions are live in the Base44 functions environment.

> During development the schema change was applied and then reverted to avoid
> leaving production in a broken state. The live `LoyaltyAccount` schema
> currently has **no** field-level RLS until this runbook is executed.

## Schema change to apply

Add the following `rls.write` rule to each of these `LoyaltyAccount` fields:

`current_balance`, `lifetime_earned`, `lifetime_redeemed`, `tier`, `status`,
`subscription_status`, `subscription_plan`, `trial_start_date`,
`trial_end_date`, `store_id`, `store_code`, `store_name`, `user_id`,
`user_email`.

```json
"rls": {
  "write": {
    "$or": [
      { "user_condition": { "role": "admin" } },
      { "user_condition": { "role": "merchant" } }
    ]
  }
}
```

Leave `read` unset on these fields so customers can still see their own balance
(row-level `read` already scopes visibility to the owner). Do **not** change the
entity-level `rls` (create/read/update/delete) — only add the per-field `write`
rules above. Service-role backend functions bypass RLS, so `redeemOffer` and
`createLoyaltyAccount` continue to write these fields.

## Verification after applying

- Customer can still **see** their balance (read unaffected).
- Customer **cannot** update `current_balance` via a direct `LoyaltyAccount`
  update (denied).
- Offer redemption works (via `redeemOffer`).
- Customer and merchant onboarding works (via `createLoyaltyAccount`).
- Merchant POS earn/burn still works (merchant satisfies the write rule).
