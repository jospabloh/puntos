import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { resolveCaller, unresolvedCallerResponse } from '../../shared/callerIdentity.ts';

// acceptInvitation — a user accepts a pending team invitation.
//
// Why server-side: onboarding used to read the Invitation on the client and then
// self-assign role/business_id via auth.updateMe. Because the User entity had no
// write protection, a malicious user could skip the invitation entirely and call
// updateMe({ role: 'business_admin'|'admin', data: { business_id: <anything> } }).
// This function is the only sanctioned path: it verifies a real pending invite
// addressed to THIS user's email and assigns exactly the role/tenant the invite
// grants — with the service role, and never `admin` (an invite can't mint owners).
//
// UN USUARIO, UN NEGOCIO (2026-09-10): aceptar una invitacion se rechaza con
// 409 si el caller ya pertenece a otro negocio. Aceptarla sobrescribe
// business_id/role, y sin el selector de negocio (retirado, nunca funciono en
// produccion) eso dejaria el negocio anterior irreversiblemente inalcanzable --
// exactamente el fallo que el selector existia para evitar. Darse de baja de un
// negocio es cosa de su administrador (manageTeamMember).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Módulo 22: business_id / role / store del llamante salen de una lectura
    // FRESCA de su registro User como servicio. La puerta de abajo DECIDE con
    // ese business_id, y una vista de sesión vieja de auth.me() la dejaría
    // pasar cuando no debe (o al revés).
    const caller = await resolveCaller(base44, user);
    if (!caller) return unresolvedCallerResponse();

    // El dueno de plataforma (role: admin) es cross-tenant: su business_id
    // activo no es una pertenencia y conserva su rol al aceptar.
    if (caller.businessId && caller.role !== 'admin') {
      return Response.json({
        error: 'Ya perteneces a un negocio. Pide a un administrador que te dé de baja antes de aceptar esta invitación.',
      }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const invitationId = body?.invitationId;

    const sr = base44.asServiceRole;
    const email = (user.email || '').trim().toLowerCase();
    if (!email) return Response.json({ error: 'No email on account' }, { status: 400 });

    // Pending invitations for THIS user's email (the email is the trust anchor —
    // the invite was addressed to it). Never trust a business_id from the client.
    const pending = await sr.entities.Invitation.filter({ email, status: 'pending' });
    let inv = null;
    if (invitationId) {
      inv = (pending || []).find((i: Record<string, unknown>) => i.id === invitationId) || null;
    } else {
      inv = (pending && pending.length > 0) ? pending[0] : null;
    }
    if (!inv) return Response.json({ error: 'No pending invitation for this account' }, { status: 404 });
    if ((inv.email || '').trim().toLowerCase() !== email) {
      return Response.json({ error: 'Invitation email mismatch' }, { status: 403 });
    }

    // An invitation can only grant business_admin or staff (merchant) — never the
    // platform-owner tier. An existing platform owner keeps admin.
    const grantsAdmin = inv.role === 'business_admin';
    const role = caller.role === 'admin' ? 'admin' : (grantsAdmin ? 'business_admin' : 'merchant');
    const appRole = caller.role === 'admin' ? 'owner' : (grantsAdmin ? 'business_admin' : 'staff');

    // A store assignment is only trusted after re-fetching the Store server-side
    // and confirming it actually belongs to the invitation's business. Invitation
    // RLS only checks business_id on create, never that store_id belongs to it —
    // a forged Invitation (business_id: own tenant, store_id: another tenant's
    // store) would otherwise land a mismatched store_id on this user, and several
    // entities' merchant RLS branches key on store_id alone with no business_id
    // check, granting cross-tenant access. Fail closed: drop the store instead of
    // trusting it.
    let storeId: string | undefined;
    let storeName: string | undefined;
    if (inv.store_id) {
      const store = await sr.entities.Store.get(inv.store_id).catch(() => null);
      if (store && store.business_id === inv.business_id) {
        storeId = store.id;
        storeName = store.name;
      }
    }


    await sr.entities.User.update(user.id, {
      role,
      app_role: appRole,
      business_id: inv.business_id,
      business_name: inv.business_name,
      storeId: storeId,
      store_id: storeId,
      store_name: storeName,
      merchant_role: grantsAdmin ? undefined : 'merchant',
      onboarding_completed: true,
    });

    try {
      await sr.entities.Invitation.update(inv.id, {
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      });
    } catch { /* audit best-effort */ }

    return Response.json({
      success: true,
      role,
      business_id: inv.business_id,
      business_name: inv.business_name,
      store_id: inv.store_id || null,
      store_name: inv.store_name || null,
      is_admin: grantsAdmin,
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return Response.json({ error: 'Failed to accept invitation' }, { status: 500 });
  }
});
