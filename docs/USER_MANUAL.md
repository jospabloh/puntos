# Puntos+ — User Manual

**Version 1.3.0 · June 2026**

---

## Table of Contents

1. [Overview](#overview)
2. [Roles & Access](#roles--access)
3. [Getting Started](#getting-started)
4. [Member Guide](#member-guide)
5. [Merchant Guide](#merchant-guide)
6. [Admin Guide](#admin-guide)
7. [Digital Wallet Passes](#digital-wallet-passes)
8. [Notifications & Preferences](#notifications--preferences)
9. [Trial Period](#trial-period)
10. [Subscription & Billing](#subscription--billing)
11. [Recent Features & Bug Fixes](#recent-features--bug-fixes-v130)

---

## Overview

**Puntos+** is a multi-tenant loyalty programme platform. Members earn points at participating stores, redeem them for offers, and track their activity through a digital wallet. Merchants manage point-of-sale transactions. Admins oversee the entire programme across all tenants.

---

## Roles & Access

| Role | Description |
|------|-------------|
| **Admin** | Full access to all data, reports, campaigns, stores, and user management |
| **Merchant** | Operates the point-of-sale; can earn and burn points for customers in their assigned store |
| **Member (Customer)** | Earns, views, and redeems points in their own account |

---

## Getting Started

### For Members
1. Register or log in via the Puntos+ app link provided by your store.
2. Complete the onboarding flow to activate your loyalty account.
3. Your digital QR code appears in the **Wallet** tab — show it at the register to earn points.

### For Merchants
1. Log in with your merchant credentials.
2. You land on the **Punto de Venta (POS)** screen automatically.
3. Select the active store from the dropdown at the top.
4. Use the **Acumular** tab to add points and **Canjear** to redeem.

### For Admins
1. Log in; you are directed to **Home** (or the Admin Dashboard link in the menu).
2. All admin pages are accessible from the main navigation.

---

## Member Guide

### Earning Points
- Points are awarded automatically when a merchant processes your purchase at the POS.
- Default rate: **1 point per $10 MXN spent**.
- Your balance updates immediately after each transaction.

### Checking Your Balance
- Open the **Home** page — your current balance and tier are shown on the points card.
- The **Wallet** page shows your QR code and live balance.
- The **History** page lists all transactions.

### Tiers

| Tier | Colour |
|------|--------|
| Bronze | 🟤 |
| Silver | ⚪ |
| Gold | 🟡 |
| Platinum | 🟣 |

Your tier is assigned by the admin based on your lifetime activity.

### Redeeming Points
1. Go to **Offers** and browse available rewards.
2. Select an offer and tap **Canjear** — the required points are deducted from your balance.
3. Show the confirmation code to the merchant to complete the redemption.

### QR Code
- Your QR code expires and auto-refreshes every **5 minutes** for security.
- Open the **Wallet** page to see the latest code. Tap refresh if needed.

---

## Merchant Guide

### POS: Earning Points for a Customer
1. On the **Acumular** tab, type the customer's email or QR token in the search box (minimum 3 characters).
2. Select the customer from the result list.
3. Enter the purchase amount in MXN and (optionally) the ticket ID.
4. The system previews the points to be awarded.
5. Tap **Registrar compra** — points are credited instantly.

> **Note:** Idempotency is enforced. If the same ticket ID is submitted twice for the same customer and store, the second attempt is rejected as a duplicate.

### POS: Redeeming Points
1. Switch to the **Canjear** tab.
2. Search for the customer and confirm their current balance.
3. Enter the number of points to redeem.
4. Tap **Confirmar canje** — the balance is deducted and an audit entry is recorded.

### Transaction History
The **Historial** tab shows the last 20 transactions for your selected store.

### Switching Stores
If you manage more than one store, use the store dropdown in the header to switch context. All operations are scoped to the selected store.

---

## Admin Guide

### Dashboard
The **Admin Dashboard** shows:
- Total active members, merchants, and stores
- Points earned vs. burned over a selectable time range (7/30/90 days)
- Transaction volume charts
- Top-performing stores

### Customers (`AdminCustomers`)
- Search customers by name or email
- View individual account details: balance, tier, lifetime stats
- Manually adjust points (ADJUST transaction type with mandatory reason)
- Suspend or reactivate accounts

### Stores (`AdminStores`)
- Create, edit, and suspend stores
- Configure per-store point rate and minimum purchase threshold
- Set daily earn limit per customer

### Campaigns (`AdminCampaigns`)
- Create time-boxed campaigns with multiplier, bonus, threshold, or category types
- Set eligible stores and member tiers
- Track budget consumption in real time

### Offers (`AdminOffers` / managed via `AdminCampaigns`)
- Create offers with a points cost, value, stock limit, and expiry
- Assign eligibility by tier and store

### Audit Log (`AdminAudit`)
- Browse all earn, burn, adjust, reverse, and admin actions
- Filter by actor, action type, store, and date range
- All merchant POS operations are automatically logged

---

## Digital Wallet Passes

### Google Wallet
1. Open the **Wallet** page and tap **Agregar a Google Wallet**.
2. A signed JWT is generated server-side and opens the Save-to-Google-Pay flow.
3. The pass displays your current balance, tier, and QR code.

### Apple Wallet
1. Open the **Wallet** page and tap **Agregar a Apple Wallet**.
2. A signed `.pkpass` file is downloaded and opened by iOS Wallet.
3. Pass design reflects your tier colour (bronze/silver/gold/platinum).

> **Requirement:** Both wallet integrations require the respective environment secrets (`GOOGLE_WALLET_SERVICE_ACCOUNT`, `GOOGLE_WALLET_ISSUER_ID`, `APPLE_WALLET_TEAM_ID`, `APPLE_WALLET_PASS_TYPE_ID`, `APPLE_WALLET_CERT_P12_BASE64`, `APPLE_WALLET_CERT_PASSWORD`) to be configured in Base44 function environment variables.

---

## Notifications & Preferences

Members can manage notification preferences from **Profile → Notificaciones**:

| Preference | Default | Description |
|------------|---------|-------------|
| Campaigns | On | New campaign announcements |
| Offers | On | New offers and rewards |
| Points Activity | On | Transaction confirmations |
| Email | On | All of the above via email |

Disabling **Email** suppresses all email-based notifications, including the weekly summary and re-engagement emails.

---

## Trial Period

New merchant tenants begin on a **30-day free trial**.

| Day | Event |
|-----|-------|
| T-7 | Reminder email sent to merchant |
| T-3 | Second reminder email sent |
| Day 0 | Trial ends; account moves to `inactive`; final reminder sent |
| Day +5 | Last-chance warning: suspension in 2 days |
| Day +7 | Account automatically suspended |

A **trial banner** is shown at the top of every merchant page until the trial ends or a subscription is activated. Suspend accounts can only be reactivated by an admin.

---

## Subscription & Billing

Contact **jose.herrera@acaciaco.com.mx** to activate a paid subscription plan and lift the trial restrictions. Available plans:

| Plan | Billing |
|------|---------|
| Monthly | Per calendar month |
| Annual | 12-month prepayment (discounted) |

---

## Recent Features & Bug Fixes (v1.3.0)

| Type | Description | Affects |
|------|-------------|---------|
| 🔒 Security Fix | QR tokens now generated with a cryptographically secure RNG | All tenants |
| 🔒 Security Fix | Internal stack traces removed from Wallet API error responses | All tenants |
| 🐛 Bug Fix | Merchant audit log entries were silently rejected due to missing RLS permission; now correctly recorded | Merchants |
| ⬆️ Version | `package.json` bumped from `0.0.0` to `1.3.0` | Build/deploy |

### Previous release highlights (v1.2.0)
- Google Wallet and Apple Wallet pass generation
- Weekly summary and re-engagement scheduled emails
- Trial lifecycle management with auto-suspension
- WelcomeTrialDialog for first-time merchant login

### Previous release highlights (v1.1.0)
- Admin Audit, Campaigns, Customers, and Stores management pages
- In-app Chat support
- Onboarding flow
- Idempotency keys on all POS transactions
