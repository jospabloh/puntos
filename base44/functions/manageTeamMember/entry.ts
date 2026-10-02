import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { resolveCaller, unresolvedCallerResponse } from '../../shared/callerIdentity.ts';

// manageTeamMember — a tenant manager changes a team member's role/store,
// removes them, or (op 'list') reads the team roster itself. This replaces the
// client writing User.role/store directly, which (with no User write-RLS)
// let anyone self-escalate. Here the service role makes the change ONLY after
// verifying the actor manages the target's tenant, and the requested role is
// never `admin`.
//
// El registro User ES la pertenencia: un usuario pertenece a un solo negocio.
// Antes existia una fila espejo aparte que habia que sincronizar en cada op --
// si se olvidaba, el selector de negocio devolvia el acceso recien revocado.
// Ese selector se retiro (2026-09-10) y con el la fila espejo, asi que limpiar
// el User es ahora toda la revocacion.
//
// 'list' (hallazgo 2026-10-02, BusinessUsers.jsx mostraba "0 personas" tras
// aprobar a alguien por código): la entidad `User` de este repo NO lleva
// `rls.read` propio (ver list_entity_schemas) — corre el default de Base44,
// que sólo deja ver la propia fila. `BusinessUsers.jsx` leía
// `base44.entities.User.filter({business_id})` directo por SDK como el
// business_admin de turno, así que el único miembro que esa consulta podía
// devolver, si acaso, era el propio admin: el conteo de equipo/asientos nunca
// reflejaba a nadie que se acabara de aprobar. Mismo patrón ya resuelto para
// `Business`/listUsers en otras apps del portafolio (rumbo:
// `manageMember.listUsers`). El filtro por `business_id` contra `User` SÍ
// funciona por service role — `manageJoinRequest` ya lo usa así para contar
// asientos (línea ~150 de ese archivo) — así que no hace falta el fallback de
// "listar todo y filtrar en memoria" que rumbo necesitó para su campo
// `data.tenant_id`.
function pick(u: any, key: string) {
  return u?.[key] ?? u?.data?.[key];
}

const ASSIGNABLE_ROLES = ['business_admin', 'merchant', 'customer'];
const OPS = ['list', 'setRole', 'assignStore', 'remove'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me();
    if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Modulo 22: el rol y el inquilino del actor salen de una lectura FRESCA de
    // su registro User como servicio. Esta funcion ESCRIBE el role/business_id
    // de otras personas, asi que decidir quien puede hacerlo con la vista
    // cacheada de auth.me() es exactamente el patron que el modulo prohibe: si
    // a este mismo actor le acaban de quitar business_admin, su sesion todavia
    // lo dice.
    const callerId = await resolveCaller(base44, actor);
    if (!callerId) return unresolvedCallerResponse();

    const actorRole = callerId.role;
    const isOwner = actorRole === 'admin';
    const isTenantAdmin = actorRole === 'business_admin';
    if (!isOwner && !isTenantAdmin) return Response.json({ error: 'No autorizado' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const op = body?.op; // 'list' | 'setRole' | 'assignStore' | 'remove'
    if (!OPS.includes(op)) {
      return Response.json({ error: 'op inválida' }, { status: 400 });
    }

    const sr = base44.asServiceRole;
    const actorBusinessId = callerId.businessId;

    // 'list' — el equipo del PROPIO negocio del llamante, nunca de otro y
    // nunca de un businessId en el cuerpo (el inquilino sale siempre de
    // callerId, releído por resolveCaller). El dueño de plataforma no tiene
    // negocio propio y BusinessUsers.jsx no dispara esta consulta para él
    // (su `user.business_id` viene vacío), así que no hace falta una ruta de
    // "ver el equipo de un negocio ajeno" aquí.
    if (op === 'list') {
      if (!actorBusinessId) return Response.json({ error: 'No perteneces a ningún negocio' }, { status: 400 });
      const rows = await sr.entities.User.filter({ business_id: actorBusinessId });
      const users = (Array.isArray(rows) ? rows : []).map((u: any) => ({
        id: u.id,
        email: u.email || '',
        full_name: u.full_name || '',
        role: pick(u, 'role') || 'customer',
        store_id: pick(u, 'store_id') || pick(u, 'storeId') || '',
        store_name: pick(u, 'store_name') || '',
        last_active_at: pick(u, 'last_active_at') || null,
      }));
      return Response.json({ ok: true, users });
    }

    const userId = body?.userId;
    if (!userId) return Response.json({ error: 'userId es obligatorio' }, { status: 400 });

    // Load the target and confirm the actor may manage them.
    let target;
    try {
      target = await sr.entities.User.get(userId);
    } catch {
      target = null;
    }
    if (!target) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });

    const targetBusinessId = pick(target, 'business_id');
    if (!isOwner) {
      // Un admin de negocio no toca a otro negocio ni al dueño de plataforma, y
      // no se degrada ni se da de baja a sí mismo: dejaría el negocio sin
      // administrador (solo otro admin o la plataforma cambian a un creador).
      if (pick(target, 'role') === 'admin' || (op !== 'assignStore' && (target.id === callerId.id || userId === callerId.id))) {
        return Response.json({ error: 'No autorizado' }, { status: 403 });
      }
    }
    if (!isOwner) {
      if (!actorBusinessId || targetBusinessId !== actorBusinessId) {
        return Response.json({ error: 'El usuario no pertenece a tu negocio' }, { status: 403 });
      }
    }
    // The tenant a manager operates within (owner acts within the target's tenant).
    const scopeBusinessId = isOwner ? targetBusinessId : actorBusinessId;

    // Resolve + validate a store assignment against the operating tenant.
    async function storeFields(storeId: string | undefined) {
      if (!storeId) return { storeId: '', store_id: '', store_name: '' };
      const store = await sr.entities.Store.get(storeId);
      if (!store) throw new Response(JSON.stringify({ error: 'Tienda no encontrada' }), { status: 404 });
      if (scopeBusinessId && store.business_id !== scopeBusinessId) {
        throw new Response(JSON.stringify({ error: 'La tienda no pertenece a tu negocio' }), { status: 403 });
      }
      return { storeId: store.id, store_id: store.id, store_name: store.name };
    }

    try {
      if (op === 'remove') {
        const updated = await sr.entities.User.update(userId, {
          role: 'customer', app_role: 'customer',
          business_id: '', business_name: '',
          storeId: '', store_id: '', store_name: '', merchant_role: '',
        });
        return Response.json({ ok: true, updated });
      }

      if (op === 'assignStore') {
        const fields = await storeFields(body?.storeId);
        const updated = await sr.entities.User.update(userId, fields);
        return Response.json({ ok: true, updated });
      }

      // op === 'setRole'
      const role = body?.role;
      if (!ASSIGNABLE_ROLES.includes(role)) {
        return Response.json({ error: 'Rol no asignable' }, { status: 400 });
      }
      const patch: Record<string, unknown> = {
        role,
        app_role: role === 'business_admin' ? 'business_admin' : role === 'merchant' ? 'staff' : 'customer',
      };
      if (role === 'merchant') {
        Object.assign(patch, await storeFields(body?.storeId), { merchant_role: 'merchant' });
      } else {
        Object.assign(patch, { storeId: '', store_id: '', store_name: '', merchant_role: '' });
      }
      const updated = await sr.entities.User.update(userId, patch);
      return Response.json({ ok: true, updated });
    } catch (e) {
      // storeFields throws a Response on validation failure.
      if (e instanceof Response) return e;
      throw e;
    }
  } catch (error) {
    console.error('Error managing team member:', error);
    return Response.json({ error: 'No se pudo actualizar al miembro' }, { status: 500 });
  }
});
