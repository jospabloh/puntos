import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Client-triggered QR token refresh (module 14 follow-up, 2026-08-24).
//
// LoyaltyAccount.qr_token/qr_token_expires just became rls.write: false
// (same PR) — closing a customer's ability to write another customer's
// token — but Wallet.jsx used to refresh its own expired token with a
// direct base44.entities.LoyaltyAccount.update() from the browser. That
// call would now be rejected once the schema deploys, breaking both the
// manual "Refrescar QR" button and QRWallet.jsx's automatic refresh on
// expiry (which retries every second). This function is the sanctioned
// replacement: service role, scoped to the caller's own account only.
//
// Not the same job as regenerateExpiredQR: that one is the scheduled/cron
// sibling that sweeps every account with no caller identity at all (it
// can't be — there's no user session in a cron). This one is on-demand,
// one account, and requires an authenticated caller who owns that account.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sr = base44.asServiceRole;

    // Load the caller's own loyalty account server-side — never trust an
    // account id from the request body (mirrors redeemOffer/exportMyData).
    const accounts = await sr.entities.LoyaltyAccount.filter({ user_id: user.id });
    const account = accounts[0];
    if (!account) return Response.json({ error: 'Loyalty account not found' }, { status: 404 });
    if (account.status && account.status !== 'active') {
      return Response.json({ error: 'La cuenta no está activa' }, { status: 403 });
    }

    // Same generation shape as regenerateExpiredQR: 9 random bytes, base36,
    // 12 chars, 5-minute window.
    const bytes = new Uint8Array(9);
    crypto.getRandomValues(bytes);
    const qrToken = Array.from(bytes, (b) => b.toString(36).padStart(2, '0'))
      .join('')
      .substring(0, 12)
      .toUpperCase();
    const qrTokenExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await sr.entities.LoyaltyAccount.update(account.id, {
      qr_token: qrToken,
      qr_token_expires: qrTokenExpires,
    });

    return Response.json({ success: true, qr_token: qrToken, qr_token_expires: qrTokenExpires });
  } catch (error) {
    console.error('Error refreshing QR token:', error);
    return Response.json({ error: 'No se pudo refrescar el código QR', success: false }, { status: 500 });
  }
});
