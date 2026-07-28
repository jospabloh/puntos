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
    // Only 'customer' is a real, wired-up flow (Onboarding.jsx is the sole
    // caller and always sends 'customer'). The former 'merchant' branch trusted
    // business_id/business_name straight from the client with no server-side
    // verification — any authenticated user could inject a phantom LoyaltyAccount
    // into an arbitrary tenant by guessing its business_id. Removed rather than
    // patched: nothing calls it, and merchant/staff role assignment already has
    // a sanctioned, verified path (acceptInvitation / manageTeamMember).
    if (type !== 'customer') {
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

    // Server-verified store — never trust business_id/business_name from the
    // client. A forged `store` object (e.g. {id: <real store>, business_id:
    // <other tenant>}) would otherwise let a caller assign their own account
    // and User record to an arbitrary tenant, since both are written below via
    // the service role (bypasses RLS). Mirrors the Store.get() lookup already
    // used by earnPoints/burnPoints. If the store itself predates the
    // multi-tenant migration and has no business_id, the account is created
    // without one too (legacy single-program mode) — never fall back to a
    // client-supplied business id/name.
    const storeId = body?.store?.id;
    if (!storeId) {
      return Response.json({ error: 'store is required for customer accounts' }, { status: 400 });
    }
    const verifiedStore = await base44.asServiceRole.entities.Store.get(storeId);
    if (!verifiedStore) {
      return Response.json({ error: 'Store not found' }, { status: 404 });
    }

    const payload = {
      ...base,
      store_id: verifiedStore.id,
      store_code: verifiedStore.code,
      store_name: verifiedStore.name,
      business_id: verifiedStore.business_id || undefined,
      business_name: verifiedStore.business_name || undefined,
      subscription_status: 'active'
    };

    const account = await base44.asServiceRole.entities.LoyaltyAccount.create(payload);

    // Set the caller's role/tenant server-side (service role), so the client no
    // longer needs to self-assign role/business_id via auth.updateMe — that path
    // let any user escalate. A customer joining a store becomes role `customer`
    // scoped to that store's tenant. An existing platform owner stays admin.
    const role = user.role === 'admin' ? 'admin' : 'customer';
    const appRole = user.role === 'admin' ? 'owner' : 'customer';
    try {
      await base44.asServiceRole.entities.User.update(user.id, {
        role,
        app_role: appRole,
        business_id: verifiedStore.business_id || undefined,
        business_name: verifiedStore.business_name || undefined,
        storeId: verifiedStore.id || undefined,
        store_id: verifiedStore.id || undefined,
        store_name: verifiedStore.name || undefined,
        onboarding_completed: true,
      });
    } catch (e) {
      console.error('Failed to set customer role:', (e as Error)?.message);
      return Response.json({ error: 'Failed to assign customer role' }, { status: 500 });
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
