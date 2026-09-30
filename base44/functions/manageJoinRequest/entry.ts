// deno-lint-ignore-file no-explicit-any
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { resolveCaller, unresolvedCallerResponse } from '../../shared/callerIdentity.ts';
import {
  MAX_PENDING_PER_BUSINESS,
  businessBlocksJoining,
  businessWritesBlocked,
  checkResolvable,
  grantForRole,
  normalizeInviteCode,
} from '../../shared/joinRequestRules.ts';

// manageJoinRequest — unión al equipo de un negocio por CÓDIGO, con aprobación.
//
// Contrato (2026-09-30): redimir Business.invite_code NO da acceso. `request`
// sólo crea una JoinRequest `pending` (el solicitante sigue siendo `customer`
// sin tenant: RLS no le abre ningún dato del negocio). Un business_admin de ESE
// negocio la ve en "Equipo y usuarios" y, al `approve`, ELIGE el rol; sólo ahí
// se escribe role/app_role/business_id del User, con el service role. Una
// invitación por correo iniciada por el admin (acceptInvitation) ya es una
// pre-aprobación y no pasa por aquí.
//
// Acciones:
//   request  {code}                    cualquier usuario sin negocio
//   cancel   {requestId}               el propio solicitante
//   approve  {requestId, role, storeId?}  business_admin del negocio / plataforma
//   reject   {requestId}               business_admin del negocio / plataforma
//
// Orden de guardias: sesión (401) -> registro almacenado del llamante, módulo 22
// (403) -> negocio/permiso -> licencia -> escritura. El negocio destino sale del
// código (request) o de la solicitud ALMACENADA (approve/reject), nunca del
// cuerpo. Una solicitud de otro negocio responde 404, igual que una inexistente.
//
// UN USUARIO, UN NEGOCIO: quien ya pertenece a uno recibe 409 (igual que
// createBusiness/acceptInvitation). Se vuelve a comprobar al aprobar, porque el
// solicitante pudo unirse a otro negocio mientras esperaba.

function bad(status: number, error: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error, ...extra }, { status });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return bad(401, 'Unauthorized');

    const caller = await resolveCaller(base44, user);
    if (!caller) return unresolvedCallerResponse();

    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const sr = base44.asServiceRole;
    const isPlatform = caller.role === 'admin';

    // ── request ────────────────────────────────────────────────────────────
    if (action === 'request') {
      if (isPlatform) return bad(400, 'El dueño de plataforma no se une a equipos por código.');
      if (caller.businessId) {
        return bad(409, 'Ya perteneces a un negocio. Pide a un administrador que te dé de baja antes de unirte a otro.');
      }

      const code = normalizeInviteCode(body?.code);
      // Mismo mensaje para "no existe", "código apagado" y "negocio suspendido":
      // el endpoint no debe servir de oráculo de qué códigos existen.
      const notValid = () => bad(404, 'Código no válido. Revísalo con quien administra el negocio.');
      if (code.length < 4) return notValid();

      const matches = await sr.entities.Business.filter({ invite_code: code });
      const business = (matches || []).find((b: any) => (b.invite_code || '').toUpperCase() === code) || null;
      if (!business || businessBlocksJoining(business)) return notValid();

      // Una sola solicitud pendiente por persona (a cualquier negocio).
      const mine = await sr.entities.JoinRequest.filter({ user_id: caller.id, status: 'pending' });
      if (mine && mine.length > 0) {
        if (mine[0].business_id === business.id) {
          return Response.json({ success: true, alreadyPending: true, request: mine[0] });
        }
        return bad(409, 'Ya tienes una solicitud pendiente en otro negocio. Cancélala antes de enviar otra.');
      }

      const pending = await sr.entities.JoinRequest.filter({ business_id: business.id, status: 'pending' });
      if ((pending || []).length >= MAX_PENDING_PER_BUSINESS) {
        return bad(429, 'Este negocio tiene demasiadas solicitudes pendientes. Pide al administrador que las revise.');
      }

      const request = await sr.entities.JoinRequest.create({
        business_id: business.id,
        business_name: business.name || '',
        user_id: caller.id,
        user_email: caller.email,
        user_name: user.full_name || (caller.email || '').split('@')[0],
        status: 'pending',
      });
      return Response.json({ success: true, request });
    }

    if (!['cancel', 'approve', 'reject'].includes(action)) return bad(400, 'Acción inválida');

    const requestId = body?.requestId;
    if (!requestId || typeof requestId !== 'string') return bad(400, 'requestId es obligatorio');

    // Siempre se relee la solicitud ALMACENADA.
    let stored: any = null;
    try { stored = await sr.entities.JoinRequest.get(requestId); } catch { stored = null; }

    // ── cancel (el propio solicitante) ─────────────────────────────────────
    if (action === 'cancel') {
      if (!stored || stored.user_id !== caller.id) return bad(404, 'Solicitud no encontrada');
      if (stored.status !== 'pending') return bad(409, 'La solicitud ya no está pendiente');
      await sr.entities.JoinRequest.update(stored.id, {
        status: 'cancelled',
        resolved_by: caller.email,
        resolved_at: new Date().toISOString(),
      });
      return Response.json({ success: true });
    }

    // ── approve / reject: sólo el admin del negocio destino (o plataforma) ──
    if (!isPlatform && caller.role !== 'business_admin') return bad(403, 'No autorizado');

    const denied = checkResolvable(stored, { role: caller.role, businessId: caller.businessId });
    if (denied === 'not_found') return bad(404, 'Solicitud no encontrada');
    if (denied === 'not_pending') return bad(409, 'La solicitud ya fue resuelta');

    const nowIso = new Date().toISOString();

    if (action === 'reject') {
      await sr.entities.JoinRequest.update(stored.id, {
        status: 'rejected',
        resolved_by: caller.email,
        resolved_at: nowIso,
      });
      return Response.json({ success: true });
    }

    // approve — el rol lo ELIGE el admin, contra lista blanca.
    const grant = grantForRole(body?.role);
    if (!grant) return bad(400, 'Rol no asignable');

    const business = await sr.entities.Business.get(stored.business_id).catch(() => null);
    if (!business) return bad(404, 'Solicitud no encontrada');
    if (businessWritesBlocked(business)) {
      return bad(403, 'write_blocked', { message: 'La licencia de este negocio está suspendida o en modo solo lectura.' });
    }

    // Asientos: personal (admins + cajeros) contra licensed_user_limit.
    const limit = Number(business.licensed_user_limit) || 0;
    if (limit > 0) {
      const members = await sr.entities.User.filter({ business_id: business.id });
      const seats = (members || []).filter((m: any) => {
        const r = m.role ?? m.data?.role;
        return r === 'business_admin' || r === 'merchant';
      }).length;
      if (seats >= limit) {
        return bad(409, 'seat_limit', { message: `El negocio ya usa todos sus asientos (${seats} de ${limit}).` });
      }
    }

    // El solicitante se relee: pudo unirse a otro negocio mientras esperaba.
    let target: any = null;
    try { target = await sr.entities.User.get(stored.user_id); } catch { target = null; }
    if (!target) return bad(404, 'El usuario ya no existe');
    const targetRole = target.role ?? target.data?.role;
    const targetBusiness = target.business_id ?? target.data?.business_id;
    if (targetRole === 'admin') return bad(400, 'Rol no asignable');
    if (targetBusiness) {
      await sr.entities.JoinRequest.update(stored.id, {
        status: 'cancelled', resolved_by: caller.email, resolved_at: nowIso,
      });
      return bad(409, 'Esta persona ya pertenece a un negocio. La solicitud se canceló.');
    }

    // Tienda opcional (sólo staff), validada contra el negocio de la solicitud.
    let store: any = null;
    if (grant.role === 'merchant' && body?.storeId) {
      store = await sr.entities.Store.get(String(body.storeId)).catch(() => null);
      if (!store || store.business_id !== business.id) return bad(403, 'La tienda no pertenece a tu negocio');
    }

    await sr.entities.User.update(stored.user_id, {
      role: grant.role,
      app_role: grant.appRole,
      business_id: business.id,
      business_name: business.name || '',
      storeId: store?.id ?? '',
      store_id: store?.id ?? '',
      store_name: store?.name ?? '',
      merchant_role: grant.merchantRole,
      onboarding_completed: true,
    });

    let warning: string | undefined;
    try {
      await sr.entities.JoinRequest.update(stored.id, {
        status: 'approved',
        granted_role: grant.appRole,
        store_id: store?.id ?? '',
        store_name: store?.name ?? '',
        resolved_by: caller.email,
        resolved_at: nowIso,
      });
    } catch (e) {
      console.error('JoinRequest approved but status write failed:', (e as Error)?.message);
      warning = 'La persona ya tiene acceso, pero no se pudo cerrar la solicitud.';
    }

    try {
      await sr.entities.AuditLog.create({
        business_id: business.id,
        business_name: business.name || '',
        actor_id: caller.id,
        actor_email: caller.email,
        actor_role: isPlatform ? 'admin' : 'business_admin',
        action: 'update',
        entity_type: 'JoinRequest',
        entity_id: stored.id,
        target_user_id: stored.user_id,
        payload_summary: `Solicitud aprobada como ${grant.appRole}: ${stored.user_email}`,
        status: 'success',
      });
    } catch { /* auditoría best-effort */ }

    return Response.json({ success: true, role: grant.appRole, warning });
  } catch (error) {
    console.error('manageJoinRequest error:', error);
    return bad(500, 'No se pudo procesar la solicitud');
  }
});
