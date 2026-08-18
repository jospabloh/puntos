import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// burnPoints — POS "redeem" operation, run entirely with the service role.
//
// Like earnPoints, the customer balance is read and written server-side so the
// client can never forge it. The points to burn come from the operator, but the
// "do you have enough?" check and the deduction are authoritative here.
//
// Authorization mirrors earnPoints (admin → any store, business_admin → own
// business, merchant → assigned store only — closing G-1).
function pick(user: any, key: string) {
  return user?.[key] ?? user?.data?.[key];
}

// Mirrors src/lib/useTenant.js's canTenantWrite() — see earnPoints/entry.ts
// for the full rationale (duplicated inline, Deno can't import across
// function directories; keep in sync).
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
    const points = Number(body?.points);
    const requestId = (body?.request_id || '').toString().trim();

    if (!storeId) return Response.json({ error: 'store_id es obligatorio' }, { status: 400 });
    if (!accountId) return Response.json({ error: 'account_id es obligatorio' }, { status: 400 });
    if (!Number.isInteger(points) || points < 1) {
      return Response.json({ error: 'Cantidad de puntos inválida' }, { status: 400 });
    }
    if (!requestId) return Response.json({ error: 'request_id es obligatorio' }, { status: 400 });

    const sr = base44.asServiceRole;

    const store = await sr.entities.Store.get(storeId);
    if (!store) return Response.json({ error: 'Tienda no encontrada' }, { status: 404 });
    if (store.status && store.status !== 'active') {
      return Response.json({ error: 'La tienda no está activa' }, { status: 400 });
    }

    const userBusinessId = pick(user, 'business_id');
    const assignedStoreId = pick(user, 'store_id') ?? pick(user, 'storeId');
    if (role !== 'admin') {
      if (!userBusinessId || store.business_id !== userBusinessId) {
        return Response.json({ error: 'La tienda no pertenece a tu negocio' }, { status: 403 });
      }
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

    const account = await sr.entities.LoyaltyAccount.get(accountId);
    if (!account) return Response.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    if (account.status && account.status !== 'active') {
      return Response.json({ error: 'La cuenta no está activa' }, { status: 403 });
    }
    if (account.store_id && account.store_id !== store.id) {
      return Response.json({ error: 'La cuenta no pertenece a esta tienda' }, { status: 403 });
    }

    // Idempotency: the client-supplied request_id (generated once per redeem
    // attempt, mandatory as of v2.0.11) lets a duplicate/retried request be
    // detected and answered with the original result instead of deducting twice.
    const idempotencyKey = `burn_${store.id}_${account.id}_${requestId}`;
    const existing = await sr.entities.PointsLedger.filter({ idempotency_key: idempotencyKey });
    if (existing && existing.length > 0) {
      const prev = existing[0];
      return Response.json({
        success: true,
        duplicate: true,
        points_burned: points,
        new_balance: prev.balance_after,
      });
    }

    const currentBalance = account.current_balance || 0;
    if (points > currentBalance) {
      return Response.json({ error: 'Saldo insuficiente' }, { status: 400 });
    }

    const newBalance = currentBalance - points;

    await sr.entities.PointsLedger.create({
      account_id: account.id,
      user_id: account.user_id,
      business_id: store.business_id,
      business_name: store.business_name,
      store_id: store.id,
      store_name: store.name,
      type: 'BURN',
      points: -points,
      balance_after: newBalance,
      reference_type: 'redemption',
      idempotency_key: idempotencyKey,
      description: `Canje en ${store.name}`,
      operator_id: user.id,
      operator_email: user.email,
      status: 'completed',
    });

    await sr.entities.LoyaltyAccount.update(account.id, {
      current_balance: newBalance,
      lifetime_redeemed: (account.lifetime_redeemed || 0) + points,
      last_activity: new Date().toISOString(),
    });

    await sr.entities.AuditLog.create({
      actor_id: user.id,
      actor_email: user.email,
      actor_role: role,
      action: 'burn',
      entity_type: 'PointsLedger',
      target_user_id: account.user_id,
      business_id: store.business_id,
      store_id: store.id,
      payload_summary: `-${points} pts burned`,
      status: 'success',
    });

    return Response.json({ success: true, points_burned: points, new_balance: newBalance });
  } catch (error) {
    console.error('Error burning points:', error);
    return Response.json({ error: 'No se pudo procesar el canje' }, { status: 500 });
  }
});
