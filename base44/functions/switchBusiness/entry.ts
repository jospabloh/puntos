import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// switchBusiness -- Modulo 18 (jospabloh/acacia-app-standard -> STANDARD.md).
//
// Unico camino para mover el business_id/role activo de un usuario que
// pertenece a mas de un negocio (via Membership). Mismo patron que
// createBusiness/acceptInvitation: nunca confia en el cliente, siempre
// re-deriva del registro almacenado.
//
// Seguridad -- el punto entero de esta funcion:
//   - El business_id que pide el cliente se valida contra el conjunto de
//     Membership del caller re-leido DESDE CERO en el servidor -- nunca se
//     confia en que el id que mando el cliente sea uno de los suyos.
//   - Un business_id fuera de ese conjunto responde EXACTAMENTE igual que
//     uno inexistente (404 generico): el endpoint no debe funcionar como
//     oraculo de existencia.
//   - El rol/tienda se re-derivan del propio Membership -- nunca se copia
//     el rol/tienda que el usuario tenia en el negocio anterior.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const targetBusinessId = typeof body?.business_id === 'string' ? body.business_id.trim() : '';
    if (!targetBusinessId) return Response.json({ error: 'business_id es requerido' }, { status: 400 });

    const sr = base44.asServiceRole;
    const memberships = await sr.entities.Membership.filter(
      { business_id: targetBusinessId, user_id: user.id },
      undefined,
      1,
    );
    const membership = memberships?.[0] || null;

    // Misma respuesta que un negocio inexistente: no confirma ni niega que
    // targetBusinessId sea un negocio real al que el caller no pertenece.
    if (!membership) {
      return Response.json({ error: 'No encontramos ese negocio.' }, { status: 404 });
    }

    const isAdmin = membership.role === 'business_admin';
    await sr.entities.User.update(user.id, {
      role: membership.role,
      app_role: isAdmin ? 'business_admin' : 'staff',
      business_id: membership.business_id,
      business_name: membership.business_name || '',
      storeId: membership.store_id || '',
      store_id: membership.store_id || '',
      store_name: membership.store_name || '',
      merchant_role: isAdmin ? undefined : 'merchant',
    });

    return Response.json({
      success: true,
      business_id: membership.business_id,
      role: membership.role,
    });
  } catch (error) {
    console.error('Error switching business:', error);
    return Response.json({ error: 'Failed to switch business' }, { status: 500 });
  }
});
