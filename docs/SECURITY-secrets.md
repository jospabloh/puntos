# Secret handling & rotation

Status of the Base44 "secrets exposed" finding: **the scanner flags functions
that READ credentials from environment variables, which is the correct, secure
pattern.** An audit (`npm run check:secrets`) confirms:

- ✅ No private key, certificate, or service-account JSON is committed to the repo.
- ✅ No real `.env` file is tracked (only `.env.example`, with empty placeholders);
  `.gitignore` excludes `.env` / `.env.*`.
- ✅ No secret is exposed to the browser — all wallet/APNs secrets are read with
  `Deno.env.get(...)` inside server-side functions, never `VITE_`-prefixed.

So there is **no secret leak in the codebase**. The remaining work is operational:
keep secrets in the Base44 function environment, and rotate them if you suspect a
value was ever shared, logged, or exposed.

## Principles (enforced by `npm run check:secrets` in CI)

1. Secrets live ONLY in the **Base44 function environment** — never in the repo,
   never in `.env.example`.
2. Never give a secret a `VITE_` prefix. `VITE_` variables are compiled into the
   public browser bundle; a `VITE_…_SECRET` would be world-readable.
3. Functions read secrets at runtime via `Deno.env.get(...)`. They must never log
   or return a secret (error responses already return fixed messages).

## Secret inventory (all server-side, Base44 function env)

| Secret | Used by | Notes |
|--------|---------|-------|
| `INGEST_HMAC_SECRET` | `acaciaControl` | HMAC secret verifying signed Mission Control requests. **Shared** with Mission Control — both sides must rotate together. |
| `GOOGLE_WALLET_SERVICE_ACCOUNT` | `createGoogleWalletPass`, `updateWalletPasses` | Full service-account JSON (contains a private key). |
| `GOOGLE_WALLET_ISSUER_ID` | `createGoogleWalletPass`, `updateWalletPasses` | Issuer id (low sensitivity). |
| `APPLE_WALLET_CERT_P12_BASE64` | `createAppleWalletPass`, `passkitWebService` | Pass-signing cert (P12, base64). |
| `APPLE_WALLET_CERT_PASSWORD` | `createAppleWalletPass`, `passkitWebService` | P12 passphrase. |
| `APPLE_WALLET_TEAM_ID` / `APPLE_WALLET_PASS_TYPE_ID` | Apple wallet functions | Identifiers (low sensitivity). |
| `APPLE_WALLET_AUTH_SECRET` | `createAppleWalletPass`, `passkitWebService` | HMAC secret for the pass `authenticationToken`. |
| `APPLE_APNS_KEY_P8` / `APPLE_APNS_KEY_ID` | `updateWalletPasses` | APNs auth key (.p8) + key id. |
| `APP_OWNER_EMAIL` | `getAppContext` | Platform-owner address that gates self-promotion to the `admin` (owner) tier. Not a credential, but **access-control sensitive** — keep server-side only, never `VITE_`-prefixed. |
| `APP_SUPPORT_EMAIL` | `getAppContext` | Support address surfaced to users. Low sensitivity; kept server-side for consistency. |

> Removed in this change: the unused `VITE_ADMIN_NOTIFICATION_EMAIL` (the client
> no longer sends admin notifications), eliminating a client-bundled value.

## Rotation runbook

Rotation happens in the provider console + the Base44 function environment — it is
**not** a code change. After rotating, redeploy/restart functions so they pick up
the new value.

0. **Mission Control HMAC secret (`INGEST_HMAC_SECRET`)**
   - This secret is **shared** between Mission Control and `acaciaControl`; both
     verify the same signature. Rotate **both sides together** or admin requests
     start failing with `bad signature`.
   - Generate a new high-entropy value (e.g. `openssl rand -hex 32`), set it in the
     Mission Control config **and** in `INGEST_HMAC_SECRET` in the Base44 function
     env, then redeploy/restart both. Confirm with the `ping` action.
1. **Google Wallet service account**
   - Google Cloud Console → IAM → Service Accounts → the wallet SA → Keys →
     create a new key, then delete the old one.
   - Update `GOOGLE_WALLET_SERVICE_ACCOUNT` in the Base44 function env with the new
     JSON.
2. **Apple pass-signing certificate**
   - Apple Developer → Certificates → revoke the Pass Type ID cert, create a new
     one, export `.p12`, base64-encode it.
   - Update `APPLE_WALLET_CERT_P12_BASE64` + `APPLE_WALLET_CERT_PASSWORD`.
3. **Apple APNs key (.p8)**
   - Apple Developer → Keys → revoke the key, create a new one (Apple Push enabled).
   - Update `APPLE_APNS_KEY_P8` + `APPLE_APNS_KEY_ID`.
4. **Pass auth HMAC secret**
   - Set a new random `APPLE_WALLET_AUTH_SECRET`. Note: existing installed passes
     carry tokens derived from the OLD secret, so rotating it invalidates refresh
     for already-issued passes until they are re-issued. Rotate only on suspected
     compromise.
5. After any rotation, trigger `updateWalletPasses` once to confirm pushes still
   succeed, and generate one test pass to confirm signing.

## Verifying hygiene

```bash
npm run check:secrets   # CI guard: no committed secrets / no VITE_ secrets
```
