# Changelog — Puntos+

All notable changes to Puntos+ are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.4.7] — 2026-06-22

### Security

- **HIGH ×3 / MODERATE / LOW — Dependency vulnerabilities resolved.** `npm audit fix` resolved 5 new vulnerabilities in `ws` (GHSA-96hv-2xvq-fx4p: memory exhaustion DoS via tiny WebSocket fragments) and its dependant `engine.io-client`. Affected the `form-data` transitive chain. All are client/browser-transport libraries and do not affect the deployed server runtime, but could affect build-time tooling. `npm audit` now reports **0 vulnerabilities**.

- **LOW — Internal error messages no longer returned to callers from `createLoyaltyAccount`, `regenerateExpiredQR`, and `checkTrialExpiration` functions.** Three serverless functions returned raw `error.message` strings (or a `details` field containing `error.message`) in their HTTP 500 error responses. This was inconsistent with the G-10 fix applied to the wallet functions in v1.4.6. All three functions now return fixed generic error messages; full details continue to be logged server-side via `console.error`.
  - `createLoyaltyAccount/entry.ts` — removed `details: error.message` from 500 response
  - `regenerateExpiredQR/entry.ts` — replaced `error: error.message` with fixed string
  - `checkTrialExpiration/entry.ts` — removed `details: error.message` from 500 response

### Known Open Items (carried)
| ID  | Severity | Description | Status |
|-----|----------|-------------|--------|
| G-1 | Medium   | Merchants can see and transact for any active store (not restricted to their own) | Open — by design (single-program model), documented |
| G-2 | Medium   | Client-side balance calculation race condition for concurrent POS earn/burn | Partially resolved (v1.4.5) — customer redemption now atomic server-side; merchant POS still client-side |
| G-7 | Medium   | `updateWalletPasses/entry.ts` is a stub — wallet push updates not yet implemented | Open — requires Google/Apple Wallet API integration |

---

## [1.4.6] — 2026-06-15

### Security
- **LOW — Wallet function error details no longer returned to client.** `createGoogleWalletPass` and `createAppleWalletPass` previously returned `error.message` in the JSON response body, which could leak internal credential or JWT error details to the browser. Both functions now return a fixed generic message (`'Failed to generate … pass'`); full error details are still logged server-side.
- **LOW — `objectId` removed from Google Wallet API response.** The response from `createGoogleWalletPass` previously included `objectId`, which was composed of `GOOGLE_WALLET_ISSUER_ID` and the internal `account.id`. The client does not need this field (only the `url` is required), so it has been removed to avoid exposing the internal record identifier.

### Fixed
- **MEDIUM — `redeemOffer` now propagates `store_id` to `Redemption` and `PointsLedger` records.** Offer redemptions performed by customers via the `redeemOffer` serverless function were creating `Redemption` and `PointsLedger` records without a `store_id`. The merchant-scoped RLS rule on both entities uses `store_id` to filter results, so those records were invisible to the merchant. Both records now carry `store_id` from the customer's `LoyaltyAccount`, matching the existing RLS expectation.

### Known Open Items (carried)
| ID  | Severity | Description | Status |
|-----|----------|-------------|--------|
| H-1 | High     | `esbuild` 0.17–0.28 supply-chain CVE (GHSA-gv7w-rqvm-qjhr) — affects build toolchain only (not deployed runtime). Fix requires upgrading to vite@8 (breaking change). Risk is low in the controlled GitHub Actions CI environment; no registry interception capability. Upgrade to vite@8 should be evaluated when the Base44 vite plugin confirms compatibility. | Open — deferred, upgrade needed |
| G-1 | Medium   | Merchants can see and transact for any active store (not restricted to their own) | Open — by design (single-program model), documented |
| G-2 | Medium   | Client-side balance calculation race condition for concurrent POS earn/burn | Partially resolved (v1.4.5) — customer redemption now atomic server-side; merchant POS still client-side |
| G-7 | Medium   | `updateWalletPasses/entry.ts` is a stub — wallet push updates not yet implemented | Open — requires Google/Apple Wallet API integration |

---

## [1.4.5] — 2026-06-08

### Security
- **CRITICAL — LoyaltyAccount financial fields hardened against tampering.** The `update` RLS rule let a normal user (`role: user`) update their own record, including `current_balance`, `lifetime_earned`/`lifetime_redeemed`, `tier`, `status`, `subscription_*` and `trial_*`. Because point balances were written client-side, a customer could set their own balance arbitrarily. Added **field-level RLS** (`rls.write`) to those fields plus `user_id`/`user_email`/`store_*`, restricting writes to `admin` or `merchant` (service-role backend bypasses RLS). Reads are unchanged, so customers still see their own balance.

### Changed
- **Customer offer redemption moved server-side.** New `redeemOffer` serverless function (service role) re-reads the account balance and offer server-side, validates funds/stock, and writes the `Redemption`, `PointsLedger` (BURN) and balance deduction atomically. `Offers.jsx` now calls the function instead of writing the balance from the browser. (Also addresses the deferred M-2 client-side balance race for redemptions.)
- **Onboarding account creation moved server-side.** New `createLoyaltyAccount` serverless function (service role) creates the `LoyaltyAccount` during customer and merchant onboarding with server-enforced safe values (balance always 0) and a one-account-per-user guard. Required because the new field-level RLS blocks normal/role-less users from writing those fields directly. `Onboarding.jsx` now calls the function for both flows.

### Notes
- Merchant POS (earn/burn) is unchanged — merchants satisfy the new field-write rule and keep writing balances at the POS.
- Both new functions must be deployed to the Base44 functions environment for redemption and onboarding to work.
- **Deploy ordering:** the field-level RLS is a manual Base44 schema step that must be applied **after** the functions are live — see `docs/RUNBOOK-loyaltyaccount-rls.md`. Applying it before deploy would break live onboarding/redemption. The live schema currently has no field-level RLS until the runbook is executed.

---

## [1.4.4] — 2026-06-08

### Security
- **Removed hardcoded email fallbacks** — The v1.4.3 env-var change kept the historical address (`... || 'jose.herrera@acaciaco.com.mx'`) as a fallback, which still embedded the address in source and was flagged by the secret scanner. The literal is now gone entirely from `checkTrialExpiration/entry.ts` and `Onboarding.jsx`. The recipient comes only from `ADMIN_NOTIFICATION_EMAIL` / `VITE_ADMIN_NOTIFICATION_EMAIL`; when unset, the admin notification (and the server-side support-contact line) is skipped while the surrounding flow (onboarding, trial lifecycle) still completes.

### Changed
- `.env.example` updated to mark the notification email as required and document the skip-when-unset behavior.

Resolves the actionable open items carried since v1.4.0.

### Security
- **M-8 / G-6 resolved** — Removed the unused `react-quill` dependency (and its transitive `quill` package), eliminating the deferred XSS advisory in the admin editor. The package was declared in `package.json` but never imported anywhere in the source, so removal is a clean fix with no behavior change. `npm audit` now reports **0 vulnerabilities** (was 2 moderate).
- **M-1 / G-5 resolved** — Moved the hardcoded admin notification email out of source. `checkTrialExpiration/entry.ts` now reads `ADMIN_NOTIFICATION_EMAIL` (Deno env) and `Onboarding.jsx` reads `VITE_ADMIN_NOTIFICATION_EMAIL` (Vite env), both falling back to the previous default so existing deployments are unaffected. Documented in `.env.example`.
- **M-3 / G-3 resolved** — Replaced `Date.now()`-based idempotency keys with a cryptographically secure suffix via the new `makeIdempotencyKey()`/`randomId()` helpers in `src/lib/utils.js`. Distinct EARN/BURN/ADJUST operations can no longer collide within the same millisecond. Real idempotency is preserved where a stable token exists (POS ticket id for EARN, redemption id for offer BURN).

### Added
- **M-7 resolved** — Added a GitHub Actions CI workflow (`.github/workflows/ci.yml`) that runs lint and build on every push to `main` and on all pull requests.
- `.env.example` documenting the required and optional environment variables.

### Changed
- Idempotency-key generation centralized in `src/lib/utils.js` and applied in `MerchantPOS.jsx` (EARN/BURN), `Offers.jsx` (BURN), and `AdminCustomers.jsx` (ADJUST).

### Known Open Items (carried)
| ID  | Severity | Description | Status |
|-----|----------|-------------|--------|
| M-2 | Medium   | Atomic server-side balance update — client-side balance calculation race window | Open — Base44 platform limitation |
| M-4 | Medium   | Merchants can transact for any active store | Open — by design (single-program model) |
| M-5 | Medium   | `updateWalletPasses/entry.ts` is a stub — wallet push updates not yet implemented | Open — requires Google/Apple Wallet API integration + credentials |
| M-6 | Low      | External QR image service receives user token; consider self-hosted generation | Open |

---

## [1.4.2] — 2026-06-08

### Security
- **CRITICAL FIX** — Replaced `Math.random()` with `crypto.getRandomValues()` in `regenerateExpiredQR/entry.ts`. The scheduled function that auto-regenerates expired QR tokens for all accounts was still using a cryptographically weak random source, allowing token prediction. Now uses the same cryptographically secure method as the client-side QR refresh in `Wallet.jsx` and `Onboarding.jsx`.
- **CRITICAL DEP FIX** — Updated `jspdf` from `4.0.0` to `4.2.1`, resolving CVE GHSA-pqxr-3g65-p328 (PDF Injection in AcroFormChoiceField — arbitrary JavaScript execution) and GHSA-95fx-jjr5-f39c (DoS via unvalidated BMP dimensions).
- **HIGH/MODERATE DEP FIXES** — Applied `npm audit fix` to resolve 24 additional vulnerabilities across transitive dependencies (react-router, axios, brace-expansion, js-yaml, yaml, ws, and others).

### Dependencies
- `jspdf` pinned to `^4.2.1` (was `^4.0.0`).
- 24 total dependency vulnerabilities resolved via `npm audit fix`.

### Known Open Items (carried from v1.4.0)
| ID  | Severity | Description |
|-----|----------|-------------|
| M-1 | Medium   | Move hardcoded admin notification email to environment variable |
| M-2 | Medium   | Atomic server-side balance update — client-side balance calculation race condition window |
| M-3 | Medium   | BURN idempotency uses `Date.now()`; rapid duplicate burn calls possible |
| M-4 | Medium   | Merchants can process transactions for any active store, not restricted to their own |
| M-5 | Medium   | `updateWalletPasses/entry.ts` is a stub — wallet push updates not yet implemented |
| M-6 | Low      | External QR image service (`api.qrserver.com`) receives user token; consider self-hosted generation |
| M-7 | Low      | No CI/CD pipeline configured |
| M-8 | Medium   | `react-quill`/`quill` XSS in admin editor — fix requires breaking change; admin-only risk |

---

## [1.4.1] — 2026-06-04

### Security
- **CRITICAL FIX** — Completed Row-Level Security (RLS) `read` rules for the `AuditLog` and `Redemption` entities. Both entities previously lacked merchant-scoped read access.
  - `AuditLog` read: admins read all records; users read their own (`actor_id`) or records that target them (`target_user_id`); merchants read records for their store (`store_id`).
  - `Redemption` read: admins read all redemptions; users read their own (`user_id`); merchants read redemptions for their store (`store_id`).

### Documentation
- Updated `docs/PERMISSIONS.md` entity-access matrix to reflect the new `AuditLog` and `Redemption` read policies.

---

## [1.4.0] — 2026-06-02

### Security
- **CRITICAL FIX** — Replaced `Math.random()` with `crypto.getRandomValues()` for QR token generation in `Wallet.jsx` and `Onboarding.jsx`. Predictable tokens could allow unauthorized account access.
- **HIGH FIX** — Removed `error.stack` from API error responses in `createGoogleWalletPass` and `createAppleWalletPass`. Stack traces are now logged server-side only.
- **MEDIUM FIX** — Removed internal `account.id` from QR code payload in `QRWallet.jsx`. Only the rotating token is now embedded in the QR barcode.

### Code Quality
- Fixed 30+ unused import lint errors across `OfferCard`, `TransactionItem`, `AdminAudit`, `AdminCampaigns`, `AdminCustomers`, `AdminDashboard`, `AdminStores`, `Chat`, `History`, `Home`, and `MerchantPOS`.
- All lint errors cleared. Build passes cleanly.

### Documentation
- Added `docs/USER_MANUAL.md` — end-user, merchant, and admin guide.
- Added `docs/PERMISSIONS.md` — RBAC matrix covering all entities and serverless functions.
- Updated `CHANGELOG.md`.

### Known Open Items (not in this release)
| ID  | Severity | Description |
|-----|----------|-------------|
| M-1 | Medium   | Move hardcoded admin email (`jose.herrera@acaciaco.com.mx`) to environment variable in `checkTrialExpiration` and `Onboarding` |
| M-2 | Medium   | Atomic server-side balance update — client-side balance calculation has a race condition window |
| M-3 | Medium   | BURN transactions lack a time-window idempotency key; rapid duplicate burn calls are possible |
| M-4 | Medium   | All merchants can see and process transactions for any active store, not just their own |
| M-5 | Medium   | `updateWalletPasses/entry.ts` is a stub — actual Google/Apple Wallet push update not yet implemented |
| M-6 | Low      | External QR image service (`api.qrserver.com`) receives user token; consider self-hosted QR generation |
| M-7 | Low      | No CI/CD pipeline — GitHub Actions not configured |
| M-8 | Low      | Browserslist and baseline-browser-mapping packages are outdated |

---

## [1.3.0] — 2026-06-01

### Security
- Replaced `Math.random()` with `crypto.getRandomValues()` in `regenerateExpiredQR/entry.ts`.
- Removed `error.stack` from Google Wallet and Apple Wallet API error responses (backend functions).
- Fixed AuditLog write permissions for merchant role.

### Documentation
- Added `CHANGELOG.md`, `docs/USER_MANUAL.md`, `docs/PERMISSIONS.md`, `docs/SECURITY_AUDIT.md`.

### Other
- Bumped `package.json` version from `0.0.0` to `1.3.0`.

> Note: PR #1 (branch `claude/epic-bardeen-vP88u`) was created for this release but never merged.
> Release 1.4.0 supersedes and includes all 1.3.0 fixes applied to the main branch.

---

## [1.2.0] — 2026-05-15

### Features
- Apple Wallet pass generation (`createAppleWalletPass`).
- Google Wallet pass generation (`createGoogleWalletPass`).
- QR token auto-refresh every 5 minutes in `QRWallet` component.
- Weekly summary emails via `sendWeeklySummary` scheduled function.
- Inactive user re-engagement emails via `cleanupInactiveUsers`.

---

## [1.1.0] — 2026-05-01

### Features
- Trial lifecycle management: 30-day trial, 7-day grace period, automatic suspension via `checkTrialExpiration`.
- `TrialBanner` and `WelcomeTrialDialog` components for merchant trial UX.
- `SuspendedAccountModal` for suspended merchant accounts.
- Merchant onboarding flow with store creation and trial account initialization.
- Customer onboarding with store code verification.

---

## [1.0.0] — 2026-04-01

### Initial Release
- Loyalty program core: points earn (EARN), redeem (BURN), manual adjust (ADJUST).
- Idempotency keys on EARN transactions.
- Admin dashboard with metrics, charts, and tier distribution.
- Admin audit log for all point-impacting actions.
- Admin store management (create, edit, delete stores with points rate config).
- Admin campaign and offer management with email notification.
- Merchant POS: customer lookup by email/QR, earn and burn flows.
- Customer wallet: QR code display, balance, transaction history.
- AI-powered offer recommendations via LLM integration.
- Notification preferences with campaign/offer email opt-in.
- Tier system: Bronze, Silver, Gold, Platinum.
