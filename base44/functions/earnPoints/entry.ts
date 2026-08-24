import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// earnPoints — POS "accumulate" operation, run entirely with the service role.
//
// Why server-side: the merchant POS used to read the customer's balance,
// compute the new balance in the browser, and write both the PointsLedger entry
// and the LoyaltyAccount.current_balance directly. A tampered client could post
// any balance it liked. This function makes the balance and the points formula
// server-authoritative — the client only sends the store, the customer account,
// and the purchase amount; everything money-equivalent is derived here.
//
// Authorization (also closes G-1, staff store pinning):
//   - admin (platform owner)  → any store
//   - business_admin          → any store inside their own business
//   - merchant (staff/cashier)→ ONLY the store they are assigned to
//
// Custom user fields live under `user.data.*` but the SDK sometimes flattens
// them onto the user; read both, same as createStore/redeemOffer.
function pick(user: any, key: string) {
  return user?.[key] ?? user?.data?.[key];
}

// Mirrors src/lib/useTenant.js's canTenantWrite() — the client already hides
// the POS behind this same posture (SuspendedAccountModal/TrialBanner via
// useTenant), but nothing server-side enforced it: a suspended/view_only
// tenant's operator could still call earnPoints directly. Deno functions
// can't import across directories, so this is duplicated inline in
// earnPoints/burnPoints/redeemOffer/createStore — keep them all in sync if
// the write-gate logic changes.
function isBusinessWriteBlocked(business: any): boolean {
  if (!business) return false;
  const status = business.billing_status || 'trial';
  return status === 'view_only' || status === 'suspended' || status === 'archived' || business.status === 'suspended';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const role = user.role;
    const isOperator =
      role === 'admin' ||
      role === 'business_admin' ||
      role === 'merchant' ||
      pick(user, 'merchant_role') === 'merchant';
    if (!isOperator) return Response.json({ error: 'No autorizado' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const storeId = body?.store_id;
    const accountId = body?.account_id;
    const amount = Number(body?.amount);
    const ticketId = (body?.ticket_id || '').toString().trim();
    const requestId = (body?.request_id || '').toString().trim();

    if (!storeId) return Response.json({ error: 'store_id es obligatorio' }, { status: 400 });
    if (!accountId) return Response.json({ error: 'account_id es obligatorio' }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: 'Monto inválido' }, { status: 400 });
    }
    if (!requestId) return Response.json({ error: 'request_id es obligatorio' }, { status: 400 });

    const sr = base44.asServiceRole;

    // Store is the source of truth for the points rate, minimum purchase, and
    // the business it belongs to — never trust those from the client.
    const store = await sr.entities.Store.get(storeId);
    if (!store) return Response.json({ error: 'Tienda no encontrada' }, { status: 404 });
    if (store.status && store.status !== 'active') {
      return Response.json({ error: 'La tienda no está activa' }, { status: 400 });
    }

    // Tenant + store-assignment authorization.
    const userBusinessId = pick(user, 'business_id');
    const assignedStoreId = pick(user, 'store_id') ?? pick(user, 'storeId');
    if (role !== 'admin') {
      if (!userBusinessId || store.business_id !== userBusinessId) {
        return Response.json({ error: 'La tienda no pertenece a tu negocio' }, { status: 403 });
      }
      // Staff/cashiers are pinned to their assigned store (G-1).
      const isStaff = role === 'merchant' || pick(user, 'merchant_role') === 'merchant';
      if (isStaff && (!assignedStoreId || assignedStoreId !== store.id)) {
        return Response.json({ error: 'Solo puedes operar en tu tienda asignada' }, { status: 403 });
      }
    }

    if (role !== 'admin') {
      const business = await sr.entities.Business.get(store.business_id).catch(() => null);
      if (isBusinessWriteBlocked(business)) {
        return Response.json({ error: 'write_blocked', message: 'La licencia de este negocio está suspendida o en modo solo lectura.' }, { status: 403 });
      }
    }

    if (amount < (store.min_purchase || 0)) {
      return Response.json({ error: 'El monto es menor a la compra mínima' }, { status: 400 });
    }

    // Account (balance) is read server-side — the source of truth.
    const account = await sr.entities.LoyaltyAccount.get(accountId);
    if (!account) return Response.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    if (account.status && account.status !== 'active') {
      return Response.json({ error: 'La cuenta no está activa' }, { status: 403 });
    }
    // Tenant isolation guard (module 14, 2026-08-23): the account must belong
    // to the same tenant as the store being operated. Fail-closed — mirrors
    // redeemOffer's account/offer check — because a legacy/unscoped account
    // (business_id: null) previously slipped past the store_id check below,
    // which only fires when store_id is already set.
    if (!account.business_id || account.business_id !== store.business_id) {
      return Response.json({ error: 'La cuenta no pertenece a este negocio' }, { status: 403 });
    }
    // The account must belong to the store being operated (mirrors the POS
    // search, which only surfaces accounts for the selected store).
    if (account.store_id && account.store_id !== store.id) {
      return Response.json({ error: 'La cuenta no pertenece a esta tienda' }, { status: 403 });
    }

    const rate = store.points_rate || 1;
    const pointsEarned = Math.floor(amount / 10) * rate;
    if (pointsEarned < 1) {
      return Response.json({ error: 'Compra muy pequeña para ganar puntos' }, { status: 400 });
    }

    // Idempotency: the client-supplied request_id (generated once per earn
    // attempt, mandatory as of v2.0.12 — mirrors burnPoints/redeemOffer since
    // v2.0.11) lets a duplicate/retried request be detected and answered with
    // the original result instead of crediting points twice. ticket_id remains
    // a separate, optional business/display field only — it never gated the
    // dedup check, which is why a blank ticket previously bypassed it entirely.
    const idempotencyKey = `earn_${store.id}_${account.id}_${requestId}`;
    const existing = await sr.entities.PointsLedger.filter({ idempotency_key: idempotencyKey });
    if (existing && existing.length > 0) {
      const prev = existing[0];
      return Response.json({
        success: true,
        duplicate: true,
        points_earned: prev.points,
        new_balance: prev.balance_after,
        amount,
      });
    }

    const currentBalance = account.current_balance || 0;
    const newBalance = currentBalance + pointsEarned;

    await sr.entities.PointsLedger.create({
      account_id: account.id,
      user_id: account.user_id,
      business_id: store.business_id,
      business_name: store.business_name,
      store_id: store.id,
      store_name: store.name,
      type: 'EARN',
      points: pointsEarned,
      balance_after: newBalance,
      amount,
      currency: 'MXN',
      reference_type: 'purchase',
      ticket_id: ticketId || `T${Date.now()}`,
      idempotency_key: idempotencyKey,
      description: `Compra en ${store.name}`,
      operator_id: user.id,
      operator_email: user.email,
      multiplier: rate,
      status: 'completed',
    });

    await sr.entities.LoyaltyAccount.update(account.id, {
      current_balance: newBalance,
      lifetime_earned: (account.lifetime_earned || 0) + pointsEarned,
      last_activity: new Date().toISOString(),
    });

    await sr.entities.AuditLog.create({
      actor_id: user.id,
      actor_email: user.email,
      actor_role: role,
      action: 'earn',
      entity_type: 'PointsLedger',
      target_user_id: account.user_id,
      business_id: store.business_id,
      store_id: store.id,
      payload_summary: `+${pointsEarned} pts from $${amount} MXN`,
      status: 'success',
    });

    return Response.json({ success: true, points_earned: pointsEarned, new_balance: newBalance, amount });
  } catch (error) {
    console.error('Error earning points:', error);
    return Response.json({ error: 'No se pudo procesar la transacción' }, { status: 500 });
  }
});
