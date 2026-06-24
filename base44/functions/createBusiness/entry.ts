import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// createBusiness — provisions a new tenant during onboarding.
//
// Runs with the service role so it can:
//   1) create the Business while Business.create RLS is locked to admins
//      (prevents arbitrary tenant creation by end users — Base44 RLS advisory), and
//   2) create the first Store and the owner's LoyaltyAccount, which a brand-new
//      user (not yet business_admin) could not create directly under tenant RLS.
//
// Server-enforced safe values: owner = caller, 30-day Starter trial, balances 0.
// The client still promotes the user via auth.updateMe (a user editing their own
// record), which is the only step that must reflect in the caller's token.

const TRIAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function randomCode(n = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const businessName = (body?.businessName || '').trim();
    const storeName = (body?.storeName || '').trim();
    const storeCode = (body?.storeCode || '').trim().toUpperCase();
    const phone = (body?.phone || '').trim();

    if (!businessName || !storeName || !storeCode) {
      return Response.json({ error: 'businessName, storeName and storeCode are required' }, { status: 400 });
    }

    // One business per owner — prevents duplicate provisioning on re-submit.
    const owned = await base44.asServiceRole.entities.Business.filter({ owner_user_id: user.id });
    if (owned.length > 0) {
      return Response.json({ error: 'Business already exists for this user', business: owned[0] }, { status: 409 });
    }

    // Store code must be globally unique (customers join by code).
    const codeTaken = await base44.asServiceRole.entities.Store.filter({ code: storeCode });
    if (codeTaken.length > 0) {
      return Response.json({ error: 'Ese código de tienda ya está en uso' }, { status: 409 });
    }

    const nowIso = new Date().toISOString();
    const trialEndIso = new Date(Date.now() + TRIAL_DAYS * DAY_MS).toISOString();

    // 1) Tenant (service role — Business.create is admin-only).
    const business = await base44.asServiceRole.entities.Business.create({
      name: businessName,
      contact_email: user.email,
      owner_user_id: user.id,
      owner_email: user.email,
      phone,
      status: 'active',
      billing_status: 'trial',
      license_plan: 'starter',
      license_cycle: 'monthly',
      licensed_user_limit: 2,
      licensed_store_limit: 1,
      invite_code: randomCode(6),
      invite_code_active: true,
      trial_start_at: nowIso,
      trial_end_at: trialEndIso,
      primary_color: '#7c3aed',
    });

    // 2) First store under the tenant.
    const store = await base44.asServiceRole.entities.Store.create({
      name: storeName,
      code: storeCode,
      business_id: business.id,
      business_name: business.name,
      merchant_id: user.id,
      merchant_name: user.full_name || user.email.split('@')[0],
      merchant_email: user.email,
      phone,
      status: 'active',
      points_rate: 1,
      min_purchase: 0,
      daily_earn_limit: 1000,
    });

    // 3) Owner's loyalty account (trial tracking), if they don't have one yet.
    const existingAccounts = await base44.asServiceRole.entities.LoyaltyAccount.filter({ user_id: user.id });
    if (existingAccounts.length === 0) {
      const bytes = new Uint8Array(9);
      crypto.getRandomValues(bytes);
      const qrToken = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').substring(0, 12).toUpperCase();
      await base44.asServiceRole.entities.LoyaltyAccount.create({
        user_id: user.id,
        user_email: user.email,
        user_name: user.full_name || user.email.split('@')[0],
        business_id: business.id,
        business_name: business.name,
        store_id: store.id,
        store_code: store.code,
        store_name: store.name,
        status: 'active',
        tier: 'bronze',
        current_balance: 0,
        lifetime_earned: 0,
        lifetime_redeemed: 0,
        qr_token: qrToken,
        qr_token_expires: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        last_activity: nowIso,
        onboarding_completed: true,
        subscription_status: 'trial',
        subscription_plan: 'trial',
        trial_start_date: nowIso,
        trial_end_date: trialEndIso,
      });
    }

    // 4) License ledger entry.
    try {
      await base44.asServiceRole.entities.LicenseEvent.create({
        business_id: business.id,
        business_name: business.name,
        event_type: 'trial_started',
        to_plan: 'starter',
        to_status: 'trial',
        effective_at: nowIso,
        expires_at: trialEndIso,
        actor_email: user.email,
        notes: `Prueba gratuita de ${TRIAL_DAYS} días iniciada en el alta del negocio.`,
      });
    } catch (_) { /* non-blocking */ }

    return Response.json({ success: true, business, store });
  } catch (error) {
    console.error('Error creating business:', error);
    return Response.json({ error: 'Failed to create business' }, { status: 500 });
  }
});
