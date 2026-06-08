# Puntos+ — User Manual

Version: 1.4.3 | Updated: 2026-06-08

---

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Customer Guide](#customer-guide)
4. [Merchant Guide](#merchant-guide)
5. [Admin Guide](#admin-guide)
6. [Permissions](#permissions)
7. [Wallet Passes](#wallet-passes)
8. [Trial and Subscription](#trial-and-subscription)
9. [Notifications](#notifications)
10. [FAQ](#faq)

---

## Overview

Puntos+ is a loyalty and rewards platform. Businesses (merchants) create loyalty programs. Customers earn points on purchases and redeem them for rewards.

---

## Getting Started

### Signing In
- Visit the Puntos+ app and click **Iniciar Sesión**.
- Authenticate through your configured identity provider.
- First-time users are redirected to the **Onboarding** flow.

### Onboarding
- Choose your account type: **Customer** or **Merchant**.
- **Customers** enter the store code provided by their merchant.
- **Merchants** enter their business name and a unique store code, then start a 30-day free trial.

---

## Customer Guide

### Home Screen
- Displays your current points balance and loyalty tier.
- Shows recent transaction activity.
- Provides quick access to your QR code, offers, and history.

### My Wallet (`/Wallet`)
- View your current points balance.
- Display your QR code to be scanned at the point of sale.
- The QR code refreshes every 5 minutes for security. You can also refresh it manually.
- Add your loyalty card to **Google Wallet** or **Apple Wallet** from this page.

### Earning Points
- Show your QR code or provide your email to the cashier.
- The merchant registers your purchase amount.
- Points are credited: **1 point per $10 MXN** (rate may vary by store).
- A confirmation notification appears in your activity feed.

### Redeeming Points
- Go to **Ofertas** to browse available rewards.
- Select an offer and tap **Canjear**.
- Confirm the redemption; your balance is deducted immediately.
- A confirmation code is displayed — show it when using your benefit.

### Transaction History (`/History`)
- View all point movements: earned, redeemed, bonuses, and adjustments.
- Filter by type (Earned, Redeemed, Bonus) and date range.
- Search by store name, description, or ticket ID.

### Offers (`/Offers`)
- Browse all active rewards.
- Filter by category: Food, Shopping, Travel, Entertainment, Services.
- AI-powered recommendations appear based on your balance and activity.
- An offer can only be redeemed if you have sufficient points.

### Chat (`/Chat`)
- AI assistant to answer questions about your account, points, and offers.

### Profile (`/Profile`)
- Update your display name and phone number.
- Manage notification preferences (campaigns, offers, activity).
- View your loyalty tier and progress to the next tier.
- Tier thresholds: Bronze → Silver (1,000 pts), Silver → Gold (5,000 pts), Gold → Platinum (15,000 pts).

---

## Merchant Guide

### Accessing the POS
- From the navigation, click **POS** to open the Point of Sale screen.
- Select the active store from the dropdown.

### Accumulating Points (Earn)
1. Select the **Acumular** tab.
2. Search for the customer by email or QR code (minimum 3 characters).
3. Select the customer from the results.
4. Enter the purchase amount in MXN and optionally a ticket number.
5. Review the points preview and click **Registrar compra**.
6. A success dialog confirms the points credited.

### Redeeming Points (Burn)
1. Select the **Canjear** tab.
2. Search for and select the customer.
3. Enter the number of points to redeem (maximum is the customer's available balance).
4. Click **Confirmar canje**.

### Transaction History (POS)
- The **Historial** tab shows the 20 most recent transactions for the selected store.

### Trial Mode
- New merchant accounts start with a **30-day free trial**.
- A trial banner is displayed at the top of the screen while in trial mode.
- A welcome dialog appears on first login to POS.
- Email reminders are sent at 7 days remaining, 3 days remaining, and on expiration.
- If the trial expires without activation, a **7-day grace period** applies before the account is suspended.
- Contact the administrator to activate a full subscription.

### Suspended Account
- If your account is suspended, a modal is displayed and POS functions are blocked.
- Contact the administrator to reactivate.

---

## Admin Guide

### Dashboard (`/AdminDashboard`)
- Overview of key metrics: active customers, points in circulation, earned/redeemed by date range.
- Bar chart of daily/weekly points activity.
- Tier distribution pie chart.
- Quick links to Stores, Campaigns, Customers, and Audit.
- Flagged transactions alert (if any transactions have `status: flagged`).

### Stores (`/AdminStores`)
- View all stores.
- **Create** a new store: set name, code, address, points rate, minimum purchase, and daily earn limit.
- **Edit** an existing store.
- **Delete** a store.
- Set store status: Active, Inactive, Suspended.

### Campaigns & Offers (`/AdminCampaigns`)

**Campaigns:**
- Create promotions: Multiplier (e.g., 2x points), Fixed Bonus (extra points per purchase), or Threshold.
- Set campaign dates and status (Draft, Active, Paused, Ended).
- Send email notifications to all subscribed users for a campaign.

**Offers:**
- Create rewards customers can redeem with their points.
- Set title, description, points cost, MXN value, category, status, and stock.
- Set stock to `-1` for unlimited.
- Send email notifications to all subscribed users for an offer.

### Customers (`/AdminCustomers`)
- View all loyalty accounts with tier, balance, earned, and redeemed totals.
- Search by name or email; filter by tier.
- **View details**: full account stats and last 20 transactions.
- **Adjust Points**: manually add or subtract points with a required reason. All adjustments are recorded in the audit log.

### Audit Log (`/AdminAudit`)
- Full audit trail of all point-impacting actions.
- Columns: timestamp, actor email, role, action type, entity, detail, status.
- Filter by action (earn, burn, adjust, reverse), role, and status.
- All earn, burn, adjust, and reverse operations create an `AuditLog` record.

### Permissions
- Granting member/merchant access is managed by updating user roles in the authentication system.
- Admin users automatically have full access to all Admin pages.
- Non-admin users are redirected to the Home page if they attempt to access Admin routes.

---

## Permissions

| Feature | Customer | Merchant | Admin |
|---------|----------|----------|-------|
| View own wallet / balance | ✅ | — | ✅ |
| Earn points (POS) | ❌ | ✅ | ✅ |
| Burn points (POS) | ❌ | ✅ | ✅ |
| View own transaction history | ✅ | — | ✅ |
| Redeem offers (self) | ✅ | — | ✅ |
| View all customer accounts | ❌ | ❌ | ✅ |
| Adjust customer points | ❌ | ❌ | ✅ |
| Manage stores | ❌ | ❌ | ✅ |
| Manage campaigns / offers | ❌ | ❌ | ✅ |
| View audit log | ❌ | ❌ | ✅ |
| Generate wallet passes | ✅ | — | ✅ |
| View dashboard metrics | ❌ | ❌ | ✅ |

---

## Wallet Passes

### Google Wallet
- From **My Wallet**, click **Google**.
- A signed JWT is generated and you are redirected to Google Pay's save URL.
- Your loyalty card is added to your Google Wallet with current balance and tier.

### Apple Wallet
- From **My Wallet**, click **Apple**.
- A `.pkpass` file is generated and downloaded.
- Open the file on an iOS device to add it to Apple Wallet.
- The pass displays your points balance, tier, and QR barcode.

### Important Notes
- Wallet passes display the balance **at the time of generation**. Use the in-app QR code for the most current balance at POS.
- Wallet credentials (certificates, service accounts) are stored as server-side environment variables and are never exposed to the client.

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

To activate a full subscription, contact the Puntos+ administrator.

---

## Notifications

From **Profile**, you can enable or disable:
- **Campaigns**: email alerts for new promotional campaigns.
- **Offers**: email alerts for new rewards.
- **Points Activity**: updates on earned/redeemed points.

The weekly summary email is sent automatically to active customers who had transactions in the previous 7 days.

---

## FAQ

**Q: My QR code says "Expirado". What do I do?**
A: Tap the **Refrescar QR** button. The code is valid for 5 minutes and refreshes automatically.

**Q: Can I use my QR code at any store?**
A: Only at the store your account is registered with.

**Q: Can my points expire?**
A: Points do not expire unless specified by the program rules.

**Q: My balance doesn't match what I expected.**
A: Go to **Historial** for a full transaction list. If there is an error, contact the store administrator.

**Q: How do I add more stores?**
A: Admin users can create additional stores from the Admin panel under **Tiendas**.
