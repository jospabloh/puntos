# Changelog

All notable changes to **Puntos+** are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.3.0] – 2026-06-01

### Security Fixes
- **CRITICAL** – Replaced `Math.random()` with `crypto.getRandomValues()` for QR token generation in `regenerateExpiredQR`. Tokens were previously predictable; they are now cryptographically secure.
- **HIGH** – Removed internal error stack traces from API responses in `createGoogleWalletPass` and `createAppleWalletPass`. Stack details are now logged server-side only, preventing information leakage to clients.
- **HIGH** – Fixed AuditLog Row-Level Security (RLS): merchants can now create audit entries scoped to their own store. Previously, all merchant-generated audit logs were silently rejected because the RLS required admin role on create.

### Changed
- Bumped `package.json` version from `0.0.0` to `1.3.0`.
- AuditLog RLS `create` rule extended: merchants may write entries where `actor_id == user.id` AND `store_id == user.data.storeId`.

---

## [1.2.0] – 2026-05-15

### Added
- **Google Wallet integration** – `createGoogleWalletPass` serverless function generates a signed JWT and returns a Save-to-Google-Pay URL for any authenticated loyalty account holder.
- **Apple Wallet integration** – `createAppleWalletPass` serverless function generates a signed `.pkpass` file with tier-specific branding (bronze/silver/gold/platinum colours).
- **Weekly summary emails** – `sendWeeklySummary` scheduled function sends each active member a summary of their points activity from the past 7 days.
- **Inactive-user re-engagement** – `cleanupInactiveUsers` sends a personalised re-engagement email to members with no activity in the last 30 days, respecting per-user `NotificationPreference` settings.
- **QR token auto-renewal** – `regenerateExpiredQR` scheduled function automatically regenerates expired QR tokens (5-minute TTL) for all accounts.
- **Trial lifecycle management** – `checkTrialExpiration` sends reminders at T-7 days, T-3 days, and day-0 of trial expiry; auto-suspends accounts 7 days after expiry.
- **WelcomeTrialDialog** – First-time trial merchants see a personalised onboarding dialog with days-remaining counter.
- **TrialBanner** – Persistent top-of-page banner shown to merchants still in their trial period.
- **SuspendedAccountModal** – Blocking modal displayed when an account reaches `status: suspended`.

### Changed
- Serverless functions migrated from root `functions/` to `base44/functions/` directory.
- `Base44 SDK` updated to `0.8.30`.

---

## [1.1.0] – 2026-04-10

### Added
- **AdminAudit page** – Admins can browse the full AuditLog with filters by actor, action type, store, and date range.
- **AdminCampaigns page** – Full CRUD for loyalty campaigns (multiplier, bonus, threshold, category types) with budget tracking.
- **AdminCustomers page** – Customer search, tier management, manual point adjustments, and account suspension controls.
- **AdminStores page** – Store creation and management, per-store point rates and purchase minimums.
- **Chat page** – In-app support chat with conversation categorisation and satisfaction ratings.
- **Onboarding flow** – Step-by-step onboarding for new merchants and customers.
- **Idempotency keys** – All EARN/BURN transactions use composite idempotency keys to prevent duplicate processing.
- **Audit trail** – Every EARN and BURN operation in MerchantPOS creates a corresponding `AuditLog` entry with operator, store, and payload summary.

### Changed
- MerchantPOS customer search scoped by `store_id` to prevent merchants from viewing customers of other stores.

---

## [1.0.0] – 2026-03-01

### Added
- Initial release of **Puntos+** loyalty platform.
- Role-based access: `admin`, `merchant`, `customer`.
- Core entities: `LoyaltyAccount`, `PointsLedger`, `Store`, `Campaign`, `Offer`, `Redemption`, `AuditLog`, `ChatConversation`, `NotificationPreference`.
- **Home page** – Member dashboard with points balance, active offers, and recent history.
- **MerchantPOS** – Point-of-sale terminal for merchants to earn and burn points per purchase.
- **AdminDashboard** – Analytics dashboard with charts for transaction volume, earned/burned points, and member growth.
- **Profile page** – Member profile management.
- **Wallet page** – QR code wallet with token expiry countdown.
- **History page** – Full transaction history with pagination.
- **Offers page** – Offer catalogue with tier-eligibility filtering.
- Row-Level Security on all entities with role-based and owner-based rules.
- Base44 SDK authentication with token-based session management.
- Stripe integration scaffolding for future subscription billing.
- Digital wallet pass placeholders (Google Pay, Apple Wallet).
- React 18 + Vite 6 + TanStack Query 5 + Shadcn/ui + Tailwind CSS 3 stack.
