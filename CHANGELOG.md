# Changelog — Puntos+

All notable changes to Puntos+ are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
