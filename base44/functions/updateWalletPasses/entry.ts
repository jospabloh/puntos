import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { SignJWT, importPKCS8 } from 'npm:jose@5.2.0';
import { verifyScheduledRequest, unauthorizedResponse } from '../../shared/scheduledGuard.ts';

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

const APNS_HOST = 'https://api.push.apple.com';

/** Mint a token-based APNs JWT (ES256, .p8 key). Valid ~1h; reused across a run. */
async function mintApnsJwt(keyP8, keyId, teamId) {
  const privateKey = await importPKCS8(keyP8, 'ES256');
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .sign(privateKey);
}

/** Send the empty background push that tells a device to pull the latest pass. */
async function sendApnsPush(jwt, topic, pushToken) {
  const res = await fetch(`${APNS_HOST}/3/device/${pushToken}`, {
    method: 'POST',
    headers: {
      'authorization': `bearer ${jwt}`,
      'apns-topic': topic,
      'apns-push-type': 'background',
      'apns-priority': '5',
      'content-type': 'application/json',
    },
    body: '{}',
  });
  return res.status; // 200 = delivered; 410 = token no longer valid
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

    // Only the platform's scheduled automation may invoke this — it passes the
    // SCHEDULED_TASK_SECRET via function_args. Anonymous external callers get 403.
    const guard = await verifyScheduledRequest(req);
    if (!guard.ok) return unauthorizedResponse(guard.reason || 'Forbidden');

    // Scheduled automation — no user session; use service role directly.

    const serviceAccountJson = Deno.env.get('GOOGLE_WALLET_SERVICE_ACCOUNT');
    const issuerId = Deno.env.get('GOOGLE_WALLET_ISSUER_ID');
    const googleConfigured = Boolean(serviceAccountJson && issuerId);

    // Apple push uses token-based APNs (.p8) so it works over HTTP/2 fetch
    // without client-cert mTLS. When the APNs key isn't configured we report it
    // honestly rather than faking a push.
    const apnsKey = Deno.env.get('APPLE_APNS_KEY_P8');
    const apnsKeyId = Deno.env.get('APPLE_APNS_KEY_ID');
    const appleTeamId = Deno.env.get('APPLE_WALLET_TEAM_ID');
    const applePassTypeId = Deno.env.get('APPLE_WALLET_PASS_TYPE_ID');
    const apnsConfigured = Boolean(apnsKey && apnsKeyId && appleTeamId && applePassTypeId);

    // Only active accounts that hold a QR token can have a live pass.
    const accounts = await base44.asServiceRole.entities.LoyaltyAccount.filter({ status: 'active' });
    const withToken = accounts.filter((a) => a.qr_token);

    const result = {
      success: true,
      total_active_accounts: accounts.length,
      google: { configured: googleConfigured, updated: 0, absent: 0, errors: 0 },
      apple: { apns_configured: apnsConfigured, push_supported: apnsConfigured, registrations: 0, pushed: 0, expired: 0, errors: 0 },
    };

    // ── Apple Wallet: push registered devices to pull the latest pass ────────
    if (apnsConfigured) {
      try {
        const regs = (await base44.asServiceRole.entities.WalletRegistration.filter({ active: true })) || [];
        result.apple.registrations = regs.length;
        if (regs.length > 0) {
          const jwt = await mintApnsJwt(apnsKey, apnsKeyId, appleTeamId);
          for (const reg of regs) {
            if (!reg.push_token) continue;
            try {
              const status = await sendApnsPush(jwt, applePassTypeId, reg.push_token);
              if (status === 200) {
                result.apple.pushed += 1;
              } else if (status === 410) {
                // Device token no longer valid — deactivate the registration.
                result.apple.expired += 1;
                await base44.asServiceRole.entities.WalletRegistration.update(reg.id, { active: false });
              } else {
                result.apple.errors += 1;
              }
            } catch (e) {
              result.apple.errors += 1;
              console.error('APNs push failed:', e.message);
            }
          }
        }
      } catch (e) {
        console.error('Apple Wallet push pass failed:', e.message);
      }
    }

    const appleSummary = `Apple: ${result.apple.pushed} pushed, ${result.apple.expired} expired, ${result.apple.errors} errors${apnsConfigured ? '' : ' (APNs not configured)'}.`;

    if (!googleConfigured) {
      result.success = apnsConfigured;
      result.message = `Google Wallet not configured. ${appleSummary}`;
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

    result.message = `Google: ${result.google.updated} updated, ${result.google.absent} not-yet-saved, ${result.google.errors} errors. ${appleSummary}`;
    return Response.json(result);
  } catch (error) {
    console.error('Update wallet error:', error);
    return Response.json({ error: 'Failed to update wallet passes' }, { status: 500 });
  }
});