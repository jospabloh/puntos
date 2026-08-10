# Puntos+ — User Manual

Version: 2.0.12 | Updated: 2026-08-10

---

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Customer Guide](#customer-guide)
4. [Staff / Cashier Guide](#staff--cashier-guide)
5. [Business Admin Guide](#business-admin-guide)
6. [Platform Owner Guide](#platform-owner-guide)
7. [Roles and Permissions](#roles-and-permissions)
8. [Wallet Passes](#wallet-passes)
9. [License Plans and Billing](#license-plans-and-billing)
10. [Team Management](#team-management)
11. [Trial and Subscription](#trial-and-subscription)
12. [Notifications](#notifications)
13. [FAQ](#faq)

---

## Overview

Puntos+ is a **multi-tenant SaaS loyalty platform**. The platform owner (ACACIA)
licenses independent businesses; each business runs its own loyalty program with
stores, staff, customers, points, and rewards. Businesses do not share data — each
tenant's customers, points, and transactions are fully isolated.

There are four roles in Puntos+:

| Role | Description |
|------|-------------|
| **Platform Owner** | ACACIA. Manages all businesses, licenses, and platform support. |
| **Business Admin** | Owner/admin of a single tenant's loyalty program. |
| **Staff / Cashier** | Operates the point of sale for a business. |
| **Customer** | End consumer using their loyalty wallet. |

---

## Getting Started

### Signing In
- Visit the Puntos+ app and click **Iniciar Sesión**.
- Authenticate through your configured identity provider.
- First-time users are redirected to the **Onboarding** flow.

### Persistent Sessions — "Continue As"
- If you have previously signed in, the app shows a **"Continue As"** screen with
  your identity on load, so you do not need to type your email again.
- If you need to switch accounts, click **Switch account** on that screen.
- Session state is kept synchronized across browser tabs automatically.

### Onboarding
There are three onboarding paths:

1. **Register a Business** — Create a new business and start a 30-day free trial.
   The server provisions your business, first store, and loyalty account with safe
   defaults. You receive a unique store code to share with your customers.
2. **Join as a Customer** — Enter the store code provided by your business to link
   your loyalty account to their program.
3. **Accept a Team Invitation** — If a business admin has invited you, follow the
   link in the invitation email. Your role and business are set automatically.

---

## Customer Guide

### Home Screen
- Displays your current points balance and loyalty tier.
- Shows recent transaction activity.
- Provides quick access to your QR code, offers, and history.

### My Wallet (`/Wallet`)
- View your current points balance and tier.
- Display your QR code to be scanned at the point of sale.
- The QR code refreshes every 5 minutes for security. You can also refresh it manually.
- Add your loyalty card to **Google Wallet** or **Apple Wallet** from this page.

### Earning Points
- Show your QR code or provide your email to the cashier.
- The cashier registers your purchase amount.
- Points are credited based on the store's configured rate (default: 1 point per $10 MXN).
- A confirmation appears in your activity feed.

### Redeeming Points
- Go to **Ofertas** to browse available rewards.
- Select an offer and tap **Canjear**.
- Confirm the redemption; your balance is deducted immediately (server-side, atomic).
- A confirmation code is displayed — show it when using your benefit.
- If a redemption is accidentally submitted twice (e.g. due to a network hiccup),
  only one deduction is applied.

### Transaction History (`/History`)
- View all point movements: earned, redeemed, bonuses, and adjustments.
- Filter by type and date range.
- Search by store name, description, or ticket number.

### Offers (`/Offers`)
- Browse all active rewards for your enrolled business.
- AI-powered recommendations appear based on your balance and activity.
- An offer can only be redeemed if you have sufficient points, the offer is active,
  and the offer belongs to the same business you are enrolled in.

### Chat (`/Chat`)
- AI assistant to answer questions about your account, points, and offers.

### Profile (`/Profile`)
- Update your display name and phone number.
- Manage notification preferences (campaigns, offers, activity).
- View your loyalty tier and progress to the next tier.
- Tier thresholds: Bronze → Silver (1,000 pts), Silver → Gold (5,000 pts), Gold → Platinum (15,000 pts).

---

## Staff / Cashier Guide

Staff members have access to the Point of Sale screen only.

### Accessing the POS
- From the navigation, click **POS**.
- Select the active store from the dropdown.

### Earning Points (Acumular)
1. Select the **Acumular** tab.
2. Search for the customer by email or QR code (minimum 3 characters).
3. Select the customer from the results.
4. Enter the purchase amount in MXN and optionally a ticket number.
5. Review the points preview and click **Registrar compra**.
6. A success dialog confirms the points credited.

### Redeeming Points (Canjear)
1. Select the **Canjear** tab.
2. Search for and select the customer.
3. Enter the number of points to redeem (maximum is the customer's available balance).
4. Click **Confirmar canje**.
5. If the confirmation is accidentally submitted twice, only one deduction is applied.

### Transaction History (POS)
- The **Historial** tab shows the 20 most recent transactions for the selected store.

---

## Business Admin Guide

Business admins manage their entire loyalty program from the back-office.

### Dashboard (`/AdminDashboard`)
- Overview of key metrics: active customers, points in circulation, earned/redeemed
  by date range, tier distribution.
- Flagged transaction alerts if any transactions have been marked for review.

### Stores (`/AdminStores`)
- View all your stores.
- **Create** a new store: the system generates a globally unique store code;
  customers use this code to join your program.
- **Edit** an existing store's name, address, points rate, minimum purchase amount,
  and daily earn limit.
- **Delete** a store (with confirmation dialog).
- Set store status: Active, Inactive, or Suspended.

### Campaigns & Offers (`/AdminCampaigns`)

**Campaigns:**
- Create promotions: Multiplier (e.g., 2× points), Fixed Bonus, or Threshold.
- Set campaign dates and status (Draft, Active, Paused, Ended).
- Send email notifications to subscribed customers for a campaign.

**Offers / Rewards:**
- Create rewards customers can redeem with their points.
- Set title, description, points cost, MXN value, category, status, and stock.
- Set stock to `-1` for unlimited.
- Send email notifications to subscribed customers for an offer.

### Customers (`/AdminCustomers`)
- View all loyalty accounts: tier, balance, lifetime earned/redeemed.
- Search by name or email; filter by tier.
- **View details**: full account stats and last 20 transactions.
- **Adjust Points**: manually add or subtract points (requires a written reason).
  All adjustments are recorded in the audit log.

### Audit Log (`/AdminAudit`)
- Full audit trail of all point-impacting actions (earn, burn, adjust, reverse).
- Filter by action type, role, and status.

### Business Settings (`/BusinessSettings`)
- Update your business name, branding, and contact information.
- Settings apply to the entire tenant program.

### Team / Users (`/BusinessUsers`)
- View all team members and their roles.
- **Invite** new staff members by email.
- **Update** a team member's role (business_admin ↔ staff).
- **Remove** a team member from the program.
- Seat limits are enforced by your license plan (see [License Plans](#license-plans-and-billing)).
- Invite and save actions are blocked when the tenant is view-only or suspended.

### Billing (`/BusinessBilling`)
- View your current license plan, usage (stores, team members, customers), and
  billing lifecycle status.
- **Request an upgrade** to a higher plan.
- View billing history and license events.

### Support (`/BusinessSupport`)
- Submit support tickets and track their status.
- Reply to existing threads.
- Rate the support interaction when resolved.

---

## Platform Owner Guide

The platform owner (ACACIA) has access to a separate control plane for managing
all tenants. These pages are not visible to business admins or customers.

### Platform Dashboard (`/PlatformDashboard`)
- Cross-tenant metrics: total tenants, MRR/ARR estimates, active customers across
  the platform, license plan distribution.

### Tenants (`/PlatformTenants`)
- View all registered businesses.
- **Create** a business (for manual provisioning).
- **Update** tenant details, plan, and billing status.
- **Lifecycle actions**: set to View-Only, Suspend, or Archive a tenant
  (with confirmation dialogs).

### Licenses (`/PlatformLicenses`)
- Manage license assignments, activations, and renewals across all tenants.
- View per-tenant usage and plan limits.

### Support Console (`/PlatformSupport`)
- View all support tickets from all tenants in one place.
- Reply to any ticket.
- Add **internal notes** (visible only to platform staff, not the tenant).

---

## Roles and Permissions

| Capability | Customer | Staff | Business Admin | Platform Owner |
|------------|----------|-------|----------------|----------------|
| View own wallet / balance | ✅ | ✅ | ✅ | ✅ |
| Earn points (POS) | — | ✅ | ✅ | ✅ |
| Burn points (POS) | — | ✅ | ✅ | ✅ |
| View own transaction history | ✅ | ✅ | ✅ | ✅ |
| Redeem offers (self) | ✅ | — | — | ✅ |
| View all customer accounts | — | — | ✅ | ✅ |
| Adjust customer points manually | — | — | ✅ | ✅ |
| Manage stores | — | — | ✅ | ✅ |
| Manage campaigns / offers | — | — | ✅ | ✅ |
| View audit log | — | — | ✅ | ✅ |
| Generate wallet passes | ✅ | ✅ | ✅ | ✅ |
| View analytics / dashboard | — | — | ✅ | ✅ |
| Invite / manage team members | — | — | ✅ | ✅ |
| View / manage billing | — | — | ✅ | ✅ |
| Submit support tickets | — | — | ✅ | ✅ |
| Manage all tenants | — | — | — | ✅ |
| Manage licenses | — | — | — | ✅ |
| View platform support console | — | — | — | ✅ |

**Default access rules:**
- **Business Admins** have full access to all features within their own tenant only.
  They cannot see or access another tenant's data.
- **Staff members** have POS access only by default. Additional capabilities can be
  granted by the business admin via the Permissions configuration.
- **Customers** can only access their own loyalty wallet, offers, history, and profile.
- New features default to **off** for staff and customers until a business admin
  explicitly enables them.

For the full granular permissions matrix, see `docs/PERMISSIONS.md`.

---

## Wallet Passes

### Google Wallet
- From **My Wallet**, click **Google Wallet**.
- A signed loyalty pass is generated and you are redirected to Google Pay's save URL.
- Your loyalty card is added to your Google Wallet with your current balance and tier.
- When scheduled balance syncs run, your Google Wallet pass is updated automatically.

### Apple Wallet
- From **My Wallet**, click **Apple Wallet**.
- A `.pkpass` file is generated and downloaded.
- Open the file on an iOS device to add it to Apple Wallet.
- The pass displays your points balance, tier, and QR barcode.
- If the web service is configured by the platform, your Apple Wallet pass can be
  updated automatically when your balance changes (device must have registered with
  the PassKit web service by adding the pass).

### Important Notes
- Wallet passes display the balance **at the time of generation or last push**.
  Use the in-app QR code for the most current balance at the point of sale.
- Wallet credentials (certificates, service accounts, APNs keys) are stored as
  server-side environment variables and are never exposed to the client.

---

## License Plans and Billing

Each business operates on a license plan. Plans determine limits on stores, team
members, customers, and available features.

| Plan | Stores | Team Members | Customers | Campaigns | Wallet Passes |
|------|--------|--------------|-----------|-----------|---------------|
| Starter (Free) | 1 | 2 | 250 | — | — |
| Growth | 5 | 10 | 5,000 | ✅ | ✅ |
| Pro | 25 | 50 | 50,000 | ✅ | ✅ |
| Enterprise | Unlimited | Unlimited | Unlimited | ✅ | ✅ |

**Billing lifecycle:**
- **Trial** (30 days) → **Active** → **View-Only** → **Suspended** → **Archived**.
- During trial, all features within your plan are available.
- **View-Only**: the program is readable but new invites and writes are blocked.
- **Suspended**: POS and customer-facing features are blocked. Contact support to reactivate.
- Lifecycle transitions are recorded as license events and visible in **Billing**.

---

## Team Management

Business admins can build and manage their team from **BusinessUsers**.

### Inviting a Team Member
1. Go to **Usuarios** in the back-office.
2. Click **Invitar**.
3. Enter the team member's email and select their role (Staff or Business Admin).
4. An invitation is sent by email. The link is valid for a limited time.
5. Seat limits are enforced — you cannot invite more members than your plan allows.

### Managing Existing Members
- **Update Role**: change a member between Staff and Business Admin.
- **Remove**: remove a member from your team. They lose access immediately.
- **Revoke Invitation**: cancel a pending invitation before it is accepted
  (a confirmation dialog is shown).

---

## Trial and Subscription

| Timeline | Event |
|----------|-------|
| Day 0 | Trial starts (30 days) |
| Day 23 | Email reminder: 7 days remaining |
| Day 27 | Email reminder: 3 days remaining |
| Day 30 | Trial expires; account moves to inactive; email sent |
| Day 35 | Final reminder email |
| Day 37 | Account suspended automatically |

To activate a full subscription, request an upgrade from **Billing** or contact support.

---

## Notifications

From **Profile**, you can enable or disable:
- **Campaigns**: email alerts for new promotional campaigns.
- **Offers**: email alerts for new rewards.
- **Points Activity**: updates on earned/redeemed points.

The weekly summary email is sent automatically to active customers who had
transactions in the previous 7 days. Customers inactive for 30+ days now also
receive a win-back reminder (fixed in v2.0.11 — a stale permission check had
silently kept this email from ever sending).

---

## FAQ

**Q: My QR code says "Expirado". What do I do?**
A: Tap **Refrescar QR**. The code is valid for 5 minutes and refreshes automatically.

**Q: Can I use my QR code at any store?**
A: Only at the store your loyalty account is registered with.

**Q: Can my points expire?**
A: Points do not expire unless the business specifies otherwise in their program rules.

**Q: My balance doesn't match what I expected.**
A: Go to **Historial** for a complete transaction list. If there is a discrepancy,
contact the store administrator.

**Q: How do I add more stores?**
A: Business admins can create stores from **Tiendas**. The system generates a unique
store code automatically.

**Q: What happens when my trial expires?**
A: Your account moves to View-Only for a grace period, then Suspended if no upgrade
is made. Your data is not deleted. Contact support or request an upgrade from Billing.

**Q: I was invited to a team but don't see the right screens.**
A: Make sure you signed in with the same email address the invitation was sent to,
and that you completed the invitation onboarding flow. Contact your business admin
if access is still missing.

**Q: Can I switch between accounts?**
A: Click **Switch account** on the "Continue As" screen at sign-in, or sign out from
Profile and sign in with a different account.
