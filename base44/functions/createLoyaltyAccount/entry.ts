import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Creates the LoyaltyAccount for the authenticated user during onboarding.
//
// Runs with the service role so the financial fields (balance, tier,
// subscription, trial dates) are set server-side with safe, fixed values.
// Balances always start at 0 — the client cannot seed an arbitrary balance.
// This is required because field-level RLS blocks normal users from writing
// those fields directly.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const type = body?.type;
    if (type !== 'customer' && type !== 'merchant') {
      return Response.json({ error: 'Invalid account type' }, { status: 400 });
    }

    // One loyalty account per user — prevents re-onboarding to reset balance.
    const existing = await base44.asServiceRole.entities.LoyaltyAccount.filter({ user_id: user.id });
    if (existing.length > 0) {
      return Response.json(
        { error: 'Loyalty account already exists', account: existing[0] },
        { status: 409 }
      );
    }

    // Server-generated QR token.
    const bytes = new Uint8Array(9);
    crypto.getRandomValues(bytes);
    const qrToken = Array.from(bytes, (b) => b.toString(36).padStart(2, '0'))
      .join('')
      .substring(0, 12)
      .toUpperCase();
    const nowIso = new Date().toISOString();
    const tokenExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Safe, server-enforced base values. Balances always start at 0.
    const base = {
      user_id: user.id,
      user_email: user.email,
      user_name: user.full_name || user.email.split('@')[0],
      status: 'active',
      tier: 'bronze',
      current_balance: 0,
      lifetime_earned: 0,
      lifetime_redeemed: 0,
      qr_token: qrToken,
      qr_token_expires: tokenExpires,
      last_activity: nowIso,
      onboarding_completed: true
    };

    let payload;
    if (type === 'customer') {
      const store = body?.store;
      if (!store?.id) {
        return Response.json({ error: 'store is required for customer accounts' }, { status: 400 });
      }
      payload = {
        ...base,
        store_id: store.id,
        store_code: store.code,
        store_name: store.name,
        subscription_status: 'active'
      };
    } else {
      const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      payload = {
        ...base,
        subscription_status: 'trial',
        subscription_plan: 'trial',
        trial_start_date: nowIso,
        trial_end_date: trialEnd
      };
    }

    const account = await base44.asServiceRole.entities.LoyaltyAccount.create(payload);

    return Response.json({ success: true, account });
  } catch (error) {
    console.error('Error creating loyalty account:', error);
    return Response.json(
      { error: 'Failed to create loyalty account', details: error.message },
      { status: 500 }
    );
  }
});
