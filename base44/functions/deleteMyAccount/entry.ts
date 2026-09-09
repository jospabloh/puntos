import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { resolveCaller, unresolvedCallerResponse } from '../../shared/callerIdentity.ts';

// Self-service account deletion — module 7 (cuenta y zona de peligro).
//
// Scoped to the "customer" role only. A merchant/business_admin/owner
// deleting themselves would orphan a Store/Business with no operator — that
// needs a real offboarding flow (reassign or close the business first), not
// a one-click self-delete, so those roles are told to contact support
// instead. This mirrors the same kind of deliberate scoping decision as
// jospabloh/radar's billing gate leaving updateSupportTicket untouched: the
// one path to fix an account issue must stay open.
//
// PointsLedger/Redemption rows are NEVER deleted (accounting/audit trail,
// same principle as StockFlow's petty-cash convention) — only the
// LoyaltyAccount is closed (status: 'closed', PII cleared) and the User row
// itself is removed.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Módulo 22: el rol sale de una lectura FRESCA del registro User. Aquí
    // decide si corre un borrado IRREVERSIBLE, así que una vista de sesión
    // vieja —alguien recién promovido a business_admin cuya sesión todavía dice
    // customer— borraría la cuenta que este chequeo existe para proteger.
    const caller = await resolveCaller(base44, user);
    if (!caller) return unresolvedCallerResponse();

    const isPrivileged =
      caller.role === 'admin' ||
      caller.role === 'business_admin' ||
      caller.role === 'merchant' ||
      caller.appRole === 'staff';
    if (isPrivileged) {
      return Response.json({
        error: 'contact_support',
        message: 'Las cuentas de administrador o equipo no pueden eliminarse desde aquí — contacta a soporte para dar de baja tu negocio o tienda.',
      }, { status: 403 });
    }

    const sr = base44.asServiceRole;

    const accounts = await sr.entities.LoyaltyAccount.filter({ user_id: user.id });
    for (const account of accounts) {
      await sr.entities.LoyaltyAccount.update(account.id, {
        status: 'closed',
        phone: '',
        qr_token: '',
      });
    }

    const preferences = await sr.entities.NotificationPreference.filter({ user_id: user.id }).catch(() => []);
    for (const pref of preferences) {
      await sr.entities.NotificationPreference.delete(pref.id).catch(() => {});
    }

    // Delete the User row itself via the caller's own client (same pattern
    // as jospabloh/flowfin's deleteAccount.ts) — best-effort: the account is
    // already closed above regardless of whether this step succeeds.
    try {
      await base44.entities.User.delete(user.id);
    } catch (e) {
      console.error('deleteMyAccount: User.delete failed (account already closed)', e);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error deleting account:', error);
    return Response.json({ error: 'No se pudo eliminar la cuenta' }, { status: 500 });
  }
});
