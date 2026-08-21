import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Manual points adjustment (AdminCustomers.jsx), gated on
 * `customers:adjust_points`.
 *
 * This was a three-write sequence run straight from the browser —
 * `PointsLedger.create` + `LoyaltyAccount.update` + `AuditLog.create` — with
 * the capability checked only by `can()` hiding the button. Points are the
 * app's unit of value: a `staff` account (or anyone an admin had explicitly
 * denied the capability) could mint an arbitrary balance from devtools, and
 * write the audit-log entry describing it. Every other value-moving path in
 * this app (earnPoints, burnPoints, redeemOffer) already runs server-side;
 * this one never did.
 *
 * Now server-authoritative in all three respects that matter:
 *  - the capability is re-checked here, honouring the tenant's
 *    `PermissionProfile` override, in the same precedence `can()` uses;
 *  - the billing gate (`view_only`/`suspended`/`archived`) applies, matching
 *    earnPoints/burnPoints/redeemOffer;
 *  - `balance_after`, the operator identity and the audit row are computed
 *    from the CURRENT stored account and the caller's own token, not from
 *    numbers the client supplied.
 */

const PERMISSIONS: Record<string, string[]> = {
  'customers:adjust_points': ['owner', 'business_admin'],
};

const BLOCKED_BILLING = new Set(['view_only', 'suspended', 'archived']);

function isBusinessWriteBlocked(business: Record<string, unknown> | null | undefined): boolean {
  if (!business) return false;
  if (BLOCKED_BILLING.has(String(business.billing_status || ''))) return true;
  return business.status === 'suspended';
}

function getAppRole(user: Record<string, any>): string {
  const role = user?.role;
  if (role === 'admin') return 'owner';
  if (role === 'business_admin') return 'business_admin';
  if (role === 'merchant') return 'staff';
  if (user?.data?.merchant_role === 'merchant' || user?.merchant_role === 'merchant') return 'staff';
  return 'customer';
}

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return Response.json({ success: false, error, ...extra }, { status });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return fail(401, 'unauthorized');

    const body = await req.json().catch(() => ({}));
    const accountId = body?.account_id;
    const points = Number(body?.points);
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    const idempotencyKey = body?.idempotency_key;

    if (!accountId) return fail(400, 'account_id es obligatorio.');
    if (!Number.isFinite(points) || points === 0) return fail(400, 'points debe ser un número distinto de cero.');
    if (!reason) return fail(400, 'La razón es obligatoria.');

    // The account is read server-side: the balance we write is computed from
    // what is stored right now, never from a client-supplied `newBalance`.
    const account = await base44.asServiceRole.entities.LoyaltyAccount.get(accountId).catch(() => null);
    if (!account) return fail(404, 'Cuenta no encontrada.');

    const role = getAppRole(user);
    const isOwner = role === 'owner';
    const callerBusinessId = user?.data?.business_id ?? user?.business_id ?? null;

    // The tenant is the ACCOUNT's, and a non-owner must belong to it.
    const businessId = account.business_id;
    if (!isOwner) {
      if (!callerBusinessId || businessId !== callerBusinessId) return fail(403, 'forbidden');

      const profiles = await base44.asServiceRole.entities.PermissionProfile.filter({
        business_id: callerBusinessId,
        role_key: role,
      });
      const key = 'customers:adjust_points';
      const override = profiles?.[0]?.permissions?.[key];
      const allowed = override === true || override === false
        ? override
        : (PERMISSIONS[key] || []).includes(role);
      if (!allowed) return fail(403, 'forbidden', { permission: key });

      const businesses = await base44.asServiceRole.entities.Business.filter({ id: callerBusinessId });
      if (isBusinessWriteBlocked(businesses?.[0])) {
        return fail(403, 'write_blocked', { billing_status: businesses?.[0]?.billing_status });
      }
    }

    // At-least-once safety: the client can retry, and a retry must not double
    // the adjustment. Same idempotency-key convention earnPoints/burnPoints use.
    if (idempotencyKey) {
      const existing = await base44.asServiceRole.entities.PointsLedger.filter({
        idempotency_key: idempotencyKey,
      });
      if (existing?.length) {
        return Response.json({
          success: true,
          duplicate: true,
          points: existing[0].points,
          new_balance: existing[0].balance_after,
        });
      }
    }

    const currentBalance = Number(account.current_balance || 0);
    const newBalance = currentBalance + points;
    if (newBalance < 0) return fail(400, 'El ajuste dejaría el saldo en negativo.');

    const businessName = account.business_name || '';

    await base44.asServiceRole.entities.PointsLedger.create({
      business_id: businessId,
      business_name: businessName,
      account_id: account.id,
      user_id: account.user_id,
      type: 'ADJUST',
      points,
      balance_after: newBalance,
      reference_type: 'manual',
      idempotency_key: idempotencyKey,
      description: `Ajuste manual: ${reason}`,
      reason,
      // Operator identity comes from the token, so the ledger cannot be
      // attributed to someone else.
      operator_id: user.id,
      operator_email: user.email,
      status: 'completed',
    });

    await base44.asServiceRole.entities.LoyaltyAccount.update(account.id, {
      current_balance: newBalance,
      lifetime_earned: points > 0
        ? Number(account.lifetime_earned || 0) + points
        : account.lifetime_earned,
      last_activity: new Date().toISOString(),
    });

    await base44.asServiceRole.entities.AuditLog.create({
      business_id: businessId,
      business_name: businessName,
      actor_id: user.id,
      actor_email: user.email,
      actor_role: isOwner ? 'admin' : role,
      action: 'adjust',
      entity_type: 'PointsLedger',
      target_user_id: account.user_id,
      payload_summary: `${points > 0 ? '+' : ''}${points} pts: ${reason}`,
      status: 'success',
    });

    return Response.json({ success: true, points, new_balance: newBalance });
  } catch (error) {
    console.error('adjustCustomerPoints failed:', error);
    return fail(500, 'No se pudo aplicar el ajuste.');
  }
});
