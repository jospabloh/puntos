import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// manageTeamMember — a tenant manager changes a team member's role/store, or
// removes them. This replaces the client writing User.role/store directly, which
// (with no User write-RLS) let anyone self-escalate. Here the service role makes
// the change ONLY after verifying the actor manages the target's tenant, and the
// requested role is never `admin`.
//
// Every op also mirrors its effect into the target's Membership row for this
// tenant (Modulo 14 reaudit, 2026-09-07 -- Codex review on PR #66 caught this
// missing). switchBusiness (Modulo 18) trusts Membership alone and never reads
// the live User record, so a removed or demoted member whose Membership row
// was left untouched here could call switchBusiness on this same business_id
// and get their old role/store back -- access this function had just revoked.
function pick(u: any, key: string) {
  return u?.[key] ?? u?.data?.[key];
}

const ASSIGNABLE_ROLES = ['business_admin', 'merchant', 'customer'];
// Membership.role enum only holds these two -- 'customer' has no Membership
// row (same reason the platform owner never gets one; see createBusiness).
const MEMBERSHIP_ROLES = ['business_admin', 'merchant'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await base44.auth.me();
    if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const actorRole = actor.role;
    const isOwner = actorRole === 'admin';
    const isTenantAdmin = actorRole === 'business_admin';
    if (!isOwner && !isTenantAdmin) return Response.json({ error: 'No autorizado' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const op = body?.op; // 'setRole' | 'assignStore' | 'remove'
    const userId = body?.userId;
    if (!userId) return Response.json({ error: 'userId es obligatorio' }, { status: 400 });
    if (!['setRole', 'assignStore', 'remove'].includes(op)) {
      return Response.json({ error: 'op inválida' }, { status: 400 });
    }

    const sr = base44.asServiceRole;
    const actorBusinessId = pick(actor, 'business_id');

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

    // Keep the target's Membership row for `scopeBusinessId` in step with
    // whatever this call just did to their User record. `next: null` means
    // the target no longer holds a tenant role here (removed, or demoted to
    // customer) -- delete the row so switchBusiness has nothing left to
    // restore from. Otherwise update the existing row's role/store in place.
    // Never creates a row: a member with no Membership yet can't be switched
    // back into by definition, so there is nothing to keep in sync.
    async function syncMembership(next: { role: string; storeId?: string; storeName?: string } | null) {
      if (!scopeBusinessId) return;
      const rows = await sr.entities.Membership.filter(
        { business_id: scopeBusinessId, user_id: userId }, undefined, 5,
      );
      if (!rows?.length) return;
      for (const row of rows) {
        if (next) {
          await sr.entities.Membership.update(row.id, {
            role: next.role,
            store_id: next.storeId || '',
            store_name: next.storeName || '',
          });
        } else {
          await sr.entities.Membership.delete(row.id);
        }
      }
    }

    try {
      if (op === 'remove') {
        const updated = await sr.entities.User.update(userId, {
          role: 'customer', app_role: 'customer',
          business_id: '', business_name: '',
          storeId: '', store_id: '', store_name: '', merchant_role: '',
        });
        await syncMembership(null);
        return Response.json({ ok: true, updated });
      }

      if (op === 'assignStore') {
        const fields = await storeFields(body?.storeId);
        const updated = await sr.entities.User.update(userId, fields);
        const targetRole = pick(target, 'role');
        if (MEMBERSHIP_ROLES.includes(targetRole)) {
          await syncMembership({ role: targetRole, storeId: fields.storeId, storeName: fields.store_name });
        }
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
      await syncMembership(
        MEMBERSHIP_ROLES.includes(role)
          ? { role, storeId: patch.storeId as string, storeName: patch.store_name as string }
          : null,
      );
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
