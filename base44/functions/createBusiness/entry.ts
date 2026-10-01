import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { resolveCaller, unresolvedCallerResponse } from '../../shared/callerIdentity.ts';

// createBusiness — provisions a new tenant during onboarding.
//
// Runs with the service role so it can:
//   1) create the Business while Business.create RLS is locked to admins
//      (prevents arbitrary tenant creation by end users — Base44 RLS advisory), and
//   2) create the first Store and the owner's LoyaltyAccount, which a brand-new
//      user (not yet business_admin) could not create directly under tenant RLS.
//
// Server-enforced safe values: owner = caller, 30-day Starter trial, balances 0.
// The caller's role/tenant promotion is also done HERE, with the service role —
// the client must NOT set its own `role`/`business_id` (that path let any user
// self-escalate to business_admin/admin). The client just refreshes its session
// afterwards so the new role lands in its token.
//
// UN USUARIO, UN NEGOCIO (2026-09-10): rechaza a un caller que ya pertenece a
// otro negocio. Durante un tiempo se permitio crear un segundo, apoyado en un
// selector que dejaba volver al primero; ese selector se retiro (nunca funciono
// en produccion), asi que sin este rechazo el negocio original quedaria
// inalcanzable en cuanto business_id se moviera al nuevo. Darse de baja de un
// negocio es cosa de su administrador (manageTeamMember).

const TRIAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I/L

function randPart(n) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

function randomCode(n = 6) {
  return randPart(n);
}

function slug(name) {
  return (name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'PP';
}

// Globally-unique store code, generated server-side (never trusted from client).
async function uniqueStoreCode(sr, name) {
  for (let i = 0; i < 12; i++) {
    const code = i < 8 ? `${slug(name)}${randPart(3)}` : randPart(8);
    const taken = await sr.entities.Store.filter({ code });
    if (!taken || taken.length === 0) return code;
  }
  return `${slug(name)}${randPart(6)}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Módulo 22: business_id / role / store del llamante salen de una lectura
    // FRESCA de su registro User como servicio. La puerta de abajo DECIDE con
    // ese business_id, y una vista de sesión vieja de auth.me() la dejaría
    // pasar cuando no debe (o al revés).
    const caller = await resolveCaller(base44, user);
    if (!caller) return unresolvedCallerResponse();

    // El dueno de plataforma (role: admin) es la excepcion: es cross-tenant y
    // su business_id activo no es una pertenencia, asi que puede seguir
    // creando negocios.
    if (caller.businessId && caller.role !== 'admin') {
      return Response.json({
        error: 'Ya perteneces a un negocio. Pide a un administrador que te dé de baja antes de crear otro.',
      }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const businessName = (body?.businessName || '').trim();
    const storeName = (body?.storeName || '').trim();
    const phone = (body?.phone || '').trim();

    if (!businessName || !storeName) {
      return Response.json({ error: 'businessName and storeName are required' }, { status: 400 });
    }

    // Store code is generated server-side and guaranteed unique — never trusted
    // from the client (avoids duplicates / collisions).
    const storeCode = await uniqueStoreCode(base44.asServiceRole, storeName || businessName);

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

    // 1b) tenant_id = id. Business RLS read/update on the built-in `id` does not
    // match the owner (returns [] / 404); a `data.tenant_id` rule with the same
    // template does. Set it now, before anything else points at this tenant; if
    // it fails, drop the tenant so none is left half-made. See CLAUDE.md
    // "Business.tenant_id".
    try {
      await base44.asServiceRole.entities.Business.update(business.id, { tenant_id: business.id });
      business.tenant_id = business.id;
    } catch (e) {
      console.error('Failed to set Business.tenant_id:', (e as Error)?.message);
      try { await base44.asServiceRole.entities.Business.delete(business.id); } catch (_) { /* best effort */ }
      return Response.json({ error: 'Failed to create business' }, { status: 500 });
    }

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
        // NOTE: no subscription_status/trial_end_date here — this account's
        // trial/billing state is Business.billing_status/trial_end_at (set
        // above), the only license authority (owned by Mission Control's
        // unified lifecycle cron). Writing a second trial clock here used to
        // feed a parallel, disconnected state machine — see
        // base44/functions/checkTrialExpiration (removed) and CLAUDE.md
        // "License lifecycle" section.
      });
    }


    // 3c) Promote the caller to business_admin of the new tenant (service role,
    // so it works even once User.role is locked to admin-only writes). An existing
    // platform owner (admin) stays admin.
    const promotedRole = caller.role === 'admin' ? 'admin' : 'business_admin';
    const promotedAppRole = caller.role === 'admin' ? 'owner' : 'business_admin';
    try {
      await base44.asServiceRole.entities.User.update(user.id, {
        role: promotedRole,
        app_role: promotedAppRole,
        business_id: business.id,
        business_name: business.name,
        storeId: store.id,
        store_id: store.id,
        store_name: store.name,
        onboarding_completed: true,
      });
    } catch (e) {
      console.error('Failed to promote business owner:', (e as Error)?.message);
      return Response.json({ error: 'Failed to assign business role' }, { status: 500 });
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
