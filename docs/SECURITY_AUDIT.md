# Puntos+ — Security & Code Quality Audit Report

**Date:** 2026-06-01  
**Auditor:** Claude Code (automated review)  
**Scope:** Full codebase — `/home/user/puntos` (branch `claude/epic-bardeen-vP88u`)  
**App version reviewed:** 0.0.0 → bumped to 1.3.0 as part of this audit  

---

## Executive Summary

The Puntos+ codebase is a well-structured React + Base44 loyalty platform with solid Row-Level Security (RLS) foundations. Three security issues were identified and **fixed as part of this audit** (two High, one Critical). Five medium findings and several low findings require follow-up. No evidence of committed secrets was found. There is zero automated test coverage and no CI/CD pipeline — these are the most significant quality gaps.

---

## Findings by Severity

### CRITICAL

#### C-1 — Weak QR Token RNG ✅ FIXED
**File:** `base44/functions/regenerateExpiredQR/entry.ts:24`  
**Description:** QR tokens were generated using `Math.random()`, a non-cryptographically-secure PRNG. An attacker could predict upcoming tokens if they observed enough historical values, enabling unauthorised point redemptions.  
**Fix applied:** Replaced with `crypto.getRandomValues(new Uint8Array(9))`, producing 72 bits of entropy.  
**Status:** Resolved in commit on this branch.

---

### HIGH

#### H-1 — Internal Stack Traces Exposed in API Responses ✅ FIXED
**Files:**
- `base44/functions/createGoogleWalletPass/entry.ts`
- `base44/functions/createAppleWalletPass/entry.ts`

**Description:** On unhandled exceptions, both functions returned `{ error: error.message, details: error.stack }` to the caller. Stack traces expose internal file paths, SDK versions, and code structure, significantly aiding an attacker in crafting targeted exploits.  
**Fix applied:** Stack traces are now logged server-side only. The client receives a generic `"Internal server error"` message.  
**Status:** Resolved in commit on this branch.

#### H-2 — AuditLog RLS Blocked Merchant Writes ✅ FIXED
**Files:**
- `src/pages/MerchantPOS.jsx:198–208`, `:267–278`
- `base44` entity schema: `AuditLog`

**Description:** `MerchantPOS.jsx` calls `base44.entities.AuditLog.create()` after every EARN and BURN transaction. The AuditLog RLS `create` rule previously required `role: admin`, so every merchant-generated audit entry was silently rejected. This meant the audit trail was incomplete — all POS operations appeared unlogged for merchant actors.  
**Fix applied:** AuditLog RLS `create` extended to allow merchants where `data.actor_id == user.id AND data.store_id == user.data.storeId`.  
**Status:** Resolved (schema updated live via Base44 API; no code change needed in MerchantPOS).

---

### MEDIUM

#### M-1 — Hardcoded Admin Contact Email
**Files:**
- `base44/functions/checkTrialExpiration/entry.ts:45, 75, 122, 127`

**Description:** The admin notification and customer-facing contact email `jose.herrera@acaciaco.com.mx` is hardcoded in the trial expiration function. If the admin email changes, all occurrences must be manually updated and redeployed.  
**Recommendation:** Move to a Base44 function environment variable (e.g., `ADMIN_CONTACT_EMAIL`).  
**Status:** Open — no code change in this audit (low blast radius, single tenant).

#### M-2 — Race Condition on Points Balance
**Files:** `src/pages/MerchantPOS.jsx:167`, `:241`

**Description:** The point balance update pattern is read-modify-write without atomic locking:
```js
const newBalance = selectedCustomer.current_balance + pointsEarned;
await base44.entities.LoyaltyAccount.update(account.id, { current_balance: newBalance });
```
Two concurrent transactions for the same customer could both read the same starting balance, resulting in one increment being lost. The source of truth should always be the `PointsLedger` (which is append-only); balance recalculation should be done server-side.  
**Recommendation:** Implement a server-side atomic balance recalculation function or use an increment operation if supported by the Base44 SDK.  
**Status:** Open — architectural change required.

#### M-3 — No Automated Tests
**Description:** Zero test files exist in the repository. There are no unit, integration, or end-to-end tests. Regressions can only be caught manually.  
**Recommendation:** Add Vitest unit tests for utility functions and critical business logic (balance calculations, idempotency key generation). Add Playwright E2E tests for the POS happy path.  
**Status:** Open.

#### M-4 — No CI/CD Pipeline
**Description:** No GitHub Actions, GitLab CI, or equivalent configuration was found. There is no automated lint, type-check, or build verification on pull requests.  
**Recommendation:** Add a GitHub Actions workflow that runs `npm run lint`, `npm run typecheck`, and `npm run build` on every PR targeting `main`.  
**Status:** Open.

#### M-5 — `updateWalletPasses` Function is a Stub
**File:** `base44/functions/updateWalletPasses/entry.ts:19–26`

**Description:** The function body contains only a `console.log` and a TODO comment — it performs no actual wallet updates. If this function is wired to a schedule, it will silently succeed without doing anything, giving a false impression of wallet synchronisation.  
**Recommendation:** Either implement the wallet sync logic or remove the function and its schedule until it is ready.  
**Status:** Open.

---

### LOW

#### L-1 — Duplicate Date Libraries
**File:** `package.json`  
**Description:** Both `date-fns` (3.6.0) and `moment` (2.30.1) are included. `moment` is in maintenance-only mode and adds ~280 KB to the bundle. The codebase should standardise on `date-fns`.  
**Recommendation:** Remove `moment`, replace any usages with `date-fns`.

#### L-2 — Uninformative Commit History
**Description:** The vast majority of commits are labelled "File changes" with no description of what changed or why. This makes bisecting, reviewing, and auditing the history extremely difficult.  
**Recommendation:** Adopt Conventional Commits (`feat:`, `fix:`, `chore:`, `security:`, etc.).

#### L-3 — `react-quill` Compatibility
**File:** `package.json` — `react-quill@2.0.0`  
**Description:** `react-quill` 2.x has known compatibility issues with React 18's strict mode and concurrent rendering. The maintainer has not released a React 18-compatible version.  
**Recommendation:** Evaluate alternatives (`@uiw/react-md-editor`, Tiptap, Lexical) for the rich-text fields.

#### L-4 — No SECURITY.md / Vulnerability Disclosure Policy
**Description:** No `SECURITY.md` file exists. There is no documented channel for responsible disclosure of vulnerabilities.  
**Recommendation:** Add a `SECURITY.md` with a contact address and expected response SLA.

#### L-5 — Apple Wallet: Same Buffer Used for Cert and Key
**File:** `base44/functions/createAppleWalletPass/entry.ts:109–114`  
**Description:**
```ts
const pass = await create(passDefinition, {
  signerCert: certBuffer,
  signerKey: certBuffer,  // same buffer as signerCert
  ...
});
```
Both `signerCert` and `signerKey` are set to the same buffer. A `.p12` file contains both the certificate and the private key, but they should be extracted separately. This may work with some library versions but is semantically incorrect and may break on library updates.  
**Recommendation:** Extract cert and key separately from the `.p12` before passing to the library.

#### L-6 — localStorage Token Storage
**File:** `src/lib/app-params.js`  
**Description:** Authentication tokens are stored in `localStorage`, making them accessible to any JavaScript running on the same origin (XSS risk). This is the standard Base44 SDK behaviour, so changing it requires SDK-level work.  
**Recommendation:** Monitor for XSS vectors in the app; ensure `react-quill` or other HTML-rendering components do not render unsanitised user content.

---

## Items Confirmed Not Present

| Risk | Status |
|------|--------|
| Hardcoded API keys / secrets in source files | Not found |
| `.env` files committed to git | Not found |
| SQL injection (no raw SQL; Base44 entity API) | Not applicable |
| Insecure direct object references on admin pages | Not found — all admin pages check `role === 'admin'` client-side and RLS enforces server-side |
| Open redirect in auth flow | Not found — redirect uses `window.location.href` passed to Base44 SDK |

---

## Actions Taken in This Audit

| # | Action | Severity Fixed | Files Changed |
|---|--------|---------------|---------------|
| 1 | Replaced `Math.random()` with `crypto.getRandomValues()` for QR tokens | Critical | `regenerateExpiredQR/entry.ts` |
| 2 | Removed `error.stack` from API error responses | High | `createGoogleWalletPass/entry.ts`, `createAppleWalletPass/entry.ts` |
| 3 | Extended AuditLog RLS to allow merchant creates | High | Base44 entity schema (live) |
| 4 | Bumped `package.json` version to `1.3.0` | — | `package.json` |
| 5 | Created `CHANGELOG.md` | — | `CHANGELOG.md` |
| 6 | Created `docs/USER_MANUAL.md` | — | `docs/USER_MANUAL.md` |
| 7 | Created `docs/PERMISSIONS.md` | — | `docs/PERMISSIONS.md` |

---

## Open Recommendations Summary

| ID | Severity | Recommendation |
|----|----------|---------------|
| M-1 | Medium | Move admin email to environment variable |
| M-2 | Medium | Replace read-modify-write balance update with atomic server-side operation |
| M-3 | Medium | Add Vitest unit tests and Playwright E2E tests |
| M-4 | Medium | Add GitHub Actions CI pipeline |
| M-5 | Medium | Implement or remove `updateWalletPasses` stub |
| L-1 | Low | Remove `moment`; use `date-fns` exclusively |
| L-2 | Low | Adopt Conventional Commits |
| L-3 | Low | Replace `react-quill` with a React-18-compatible rich text library |
| L-4 | Low | Add `SECURITY.md` |
| L-5 | Low | Fix Apple Wallet cert/key split |
| L-6 | Low | Audit XSS surface for components rendering user-supplied HTML |
