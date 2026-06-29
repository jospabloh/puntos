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

    // Tenant context. Runs as service role, so it can set the field-level
    // RLS-restricted `business_id` that a normal customer cannot write itself.
    // For customers it is derived from the store; for merchants/owners it is
    // passed explicitly. Falls back gracefully when absent (legacy single-program).
    const businessParam = body?.business;

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
        business_id: store.business_id || businessParam?.id,
        business_name: store.business_name || businessParam?.name,
        subscription_status: 'active'
      };
    } else {
      const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      payload = {
        ...base,
        business_id: businessParam?.id,
        business_name: businessParam?.name,
        subscription_status: 'trial',
        subscription_plan: 'trial',
        trial_start_date: nowIso,
        trial_end_date: trialEnd
      };
    }

    const account = await base44.asServiceRole.entities.LoyaltyAccount.create(payload);

    // Set the caller's role/tenant server-side (service role), so the client no
    // longer needs to self-assign role/business_id via auth.updateMe — that path
    // let any user escalate. A customer joining a store becomes role `customer`
    // scoped to that store's tenant. An existing platform owner stays admin.
    if (type === 'customer') {
      const store = body?.store;
      const role = user.role === 'admin' ? 'admin' : 'customer';
      const appRole = user.role === 'admin' ? 'owner' : 'customer';
      try {
        await base44.asServiceRole.entities.User.update(user.id, {
          role,
          app_role: appRole,
          business_id: store?.business_id || businessParam?.id || undefined,
          business_name: store?.business_name || businessParam?.name || undefined,
          storeId: store?.id || undefined,
          store_id: store?.id || undefined,
          store_name: store?.name || undefined,
          onboarding_completed: true,
        });
      } catch (e) {
        console.error('Failed to set customer role:', (e as Error)?.message);
        return Response.json({ error: 'Failed to assign customer role' }, { status: 500 });
      }
    }

    return Response.json({ success: true, account });
  } catch (error) {
    console.error('Error creating loyalty account:', error);
    return Response.json(
      { error: 'Failed to create loyalty account' },
      { status: 500 }
    );
  }
});
