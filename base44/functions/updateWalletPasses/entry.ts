import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { SignJWT, importPKCS8 } from 'npm:jose@5.2.0';

// updateWalletPasses — pushes the current points balance to issued wallet passes.
//
// Google Wallet: fully implemented. We mint a service-account OAuth2 token and
// PATCH each user's loyaltyObject balance via the Google Wallet REST API. Objects
// the user has not saved yet (404) are skipped silently.
//
// Apple Wallet: a real push requires the PassKit web service (device
// registration endpoints + an APNs push signed with the Pass Type ID cert) and a
// device registry, none of which exist yet. We therefore do NOT pretend to update
// Apple passes — we report it as unsupported, so the gap is explicit rather than a
// misleading success log. See docs/RUNBOOK-multitenant.md / G-7 for what the Apple
// side still needs.
//
// Scheduled task: requires role admin (service-role context).

const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const WALLET_OBJECT_API = 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject';
const WALLET_SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';

/** Mint a short-lived OAuth2 access token for the Wallet API from the service account. */
async function getGoogleAccessToken(serviceAccount) {
  const privateKey = await importPKCS8(serviceAccount.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: WALLET_SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(serviceAccount.client_email)
    .setSubject(serviceAccount.client_email)
    .setAudience(GOOGLE_TOKEN_URI)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);

  const res = await fetch(GOOGLE_TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status}`);
  }
  const json = await res.json();
  return json.access_token;
}

/** PATCH one loyalty object's points balance. Returns 'updated' | 'absent' | 'error'. */
async function patchGoogleObject(accessToken, objectId, balance) {
  const res = await fetch(`${WALLET_OBJECT_API}/${encodeURIComponent(objectId)}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ loyaltyPoints: { balance: { int: balance } } }),
  });
  if (res.ok) return 'updated';
  // 404 = the user has not saved the pass yet (object does not exist). Not an error.
  if (res.status === 404) return 'absent';
  return 'error';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Authenticate as admin (required for scheduled tasks).
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const serviceAccountJson = Deno.env.get('GOOGLE_WALLET_SERVICE_ACCOUNT');
    const issuerId = Deno.env.get('GOOGLE_WALLET_ISSUER_ID');
    const googleConfigured = Boolean(serviceAccountJson && issuerId);

    const appleConfigured = Boolean(
      Deno.env.get('APPLE_WALLET_TEAM_ID') &&
      Deno.env.get('APPLE_WALLET_PASS_TYPE_ID') &&
      Deno.env.get('APPLE_WALLET_CERT_P12_BASE64'),
    );

    // Only active accounts that hold a QR token can have a live pass.
    const accounts = await base44.asServiceRole.entities.LoyaltyAccount.filter({ status: 'active' });
    const withToken = accounts.filter((a) => a.qr_token);

    const result = {
      success: true,
      total_active_accounts: accounts.length,
      google: { configured: googleConfigured, updated: 0, absent: 0, errors: 0 },
      // Apple push is intentionally not faked — see header.
      apple: { configured: appleConfigured, push_supported: false, pending: appleConfigured ? withToken.length : 0 },
    };

    if (!googleConfigured) {
      result.success = appleConfigured ? true : false;
      result.message = 'Google Wallet not configured; nothing to push.';
      return Response.json(result);
    }

    let accessToken;
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      accessToken = await getGoogleAccessToken(serviceAccount);
    } catch (e) {
      console.error('Google Wallet auth failed:', e.message);
      return Response.json({ ...result, success: false, message: 'Google Wallet authentication failed' }, { status: 502 });
    }

    for (const account of withToken) {
      const objectId = `${issuerId}.${account.id}`;
      try {
        const outcome = await patchGoogleObject(accessToken, objectId, account.current_balance || 0);
        if (outcome === 'updated') result.google.updated += 1;
        else if (outcome === 'absent') result.google.absent += 1;
        else {
          result.google.errors += 1;
          console.error(`Google Wallet update failed for ${account.user_email}`);
        }
      } catch (e) {
        result.google.errors += 1;
        console.error(`Google Wallet update threw for ${account.user_email}:`, e.message);
      }
    }

    result.message = `Google Wallet: ${result.google.updated} updated, ${result.google.absent} not-yet-saved, ${result.google.errors} errors.`;
    return Response.json(result);
  } catch (error) {
    console.error('Update wallet error:', error);
    return Response.json({ error: 'Failed to update wallet passes' }, { status: 500 });
  }
});
