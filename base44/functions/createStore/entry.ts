import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { resolveCaller, unresolvedCallerResponse } from '../../shared/callerIdentity.ts';

// createStore — adds a store to the caller's tenant with a server-generated,
// globally-unique code. The code is never accepted from the client, so two
// stores can never collide on the code customers join with.
//
// Runs as service role: it reads the caller's business_id from their user record
// and stamps the new store, then checks code uniqueness across ALL stores before
// creating (the check + create happen server-side to avoid a client race).

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I/L

function randPart(n: number) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

function slug(name: string) {
  return (name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'PP';
}

// Mirrors src/lib/useTenant.js's canTenantWrite() — see earnPoints/entry.ts
// for the full rationale.
// duplicated inline. NOTA (2026-09-09): la razón que este comentario daba
// —«Deno no puede importar entre directorios de función»— es FALSA, y lo
// era ya cuando se escribió: `base44/shared/` sí se importa desde
// cualquier función y cuatro crons llevan meses haciéndolo con
// `scheduledGuard.ts` (y ahora `callerIdentity.ts`). Lo que de verdad no
// se puede es importar desde `src/`, que no viaja en el bundle. La copia
// sigue aquí porque consolidarla toca las cuatro funciones que mueven
// puntos y merece su propio cambio; mantenlas en sync mientras tanto.
function isBusinessWriteBlocked(business: any): boolean {
  if (!business) return false;
  const status = business.billing_status || 'trial';
  return status === 'view_only' || status === 'suspended' || status === 'archived' || business.status === 'suspended';
}

async function uniqueStoreCode(sr: any, name: string) {
  for (let i = 0; i < 12; i++) {
    const code = i < 8 ? `${slug(name)}${randPart(3)}` : randPart(8);
    const taken = await sr.entities.Store.filter({ code });
    if (!taken || taken.length === 0) return code;
  }
  return `${slug(name)}${randPart(6)}`; // astronomically unlikely fallback
}

// Mirror of the subset of PERMISSIONS (src/lib/rbac.js) this function gates.
// scripts/validate-permissions.mjs fails the build if it drifts.
const PERMISSIONS: Record<string, string[]> = {
  'stores:create': ['owner', 'business_admin'],
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // Módulo 22: el inquilino y el rol del llamante salen de una lectura FRESCA
    // de su registro User como servicio. auth.me() es la vista de sesión y está
    // cacheada; en cuanto switchBusiness o manageTeamMember escriben business_id
    // o role, esa vista miente — y aquí decide EN QUÉ inquilino se crea la
    // tienda, que es justo el caso que el módulo 22 nombra como el peor.
    const caller = await resolveCaller(base44, user);
    if (!caller) return unresolvedCallerResponse();

    const ownBusinessId = caller.businessId;
    const ownBusinessName = caller.businessName;
    // The platform owner (role admin) may create a store inside ANY tenant they
    // are administering — honor the explicit business_id override. Everyone else
    // is pinned to their own business.
    const isAdmin = caller.role === 'admin';
    const businessId = (isAdmin && body?.business_id) ? body.business_id : ownBusinessId;
    if (!businessId) return Response.json({ error: 'No tienes un negocio asignado' }, { status: 403 });

    // business_name is a display field only (business_id is the real scoping
    // value), but resolve it server-side rather than trust body.business_name
    // verbatim so it can't drift from the actual Business record.
    let businessName = ownBusinessName;
    if (isAdmin && body?.business_id) {
      const business = await base44.asServiceRole.entities.Business.get(businessId).catch(() => null);
      businessName = business?.name || '';
    }

    const name = (body?.name || '').trim();
    if (!name) return Response.json({ error: 'El nombre de la tienda es obligatorio' }, { status: 400 });

    const sr = base44.asServiceRole;

    if (!isAdmin) {
      // Module 3: the `stores:create` capability, re-checked server-side in the
      // same precedence src/lib/rbac.js's can() uses — an explicit
      // PermissionProfile override for this tenant + role wins over the default
      // matrix. Without this, the billing gate below was the ONLY server-side
      // check, so a `staff` account could create stores despite the capability
      // being business_admin-only. Mirrors the same block in
      // guardedEntityWrite; scripts/validate-permissions.mjs guards the drift.
      const role = caller.appRole;
      const profiles = await sr.entities.PermissionProfile.filter({
        business_id: businessId,
        role_key: role,
      });
      const override = profiles?.[0]?.permissions?.['stores:create'];
      const allowed = override === true || override === false
        ? override
        : PERMISSIONS['stores:create'].includes(role);
      if (!allowed) {
        return Response.json({ error: 'forbidden', permission: 'stores:create' }, { status: 403 });
      }

      const business = await sr.entities.Business.get(businessId).catch(() => null);
      if (isBusinessWriteBlocked(business)) {
        return Response.json({ error: 'write_blocked', message: 'La licencia de tu negocio está suspendida o en modo solo lectura.' }, { status: 403 });
      }
    }
    const code = await uniqueStoreCode(sr, name);

    const store = await sr.entities.Store.create({
      name,
      code,
      business_id: businessId,
      business_name: businessName,
      merchant_id: user.id,
      merchant_name: user.full_name || user.email?.split('@')[0],
      merchant_email: user.email,
      address: body?.address || '',
      city: body?.city || '',
      state: body?.state || '',
      phone: body?.phone || '',
      status: body?.status || 'active',
      points_rate: typeof body?.points_rate === 'number' ? body.points_rate : 1,
      min_purchase: typeof body?.min_purchase === 'number' ? body.min_purchase : 0,
      daily_earn_limit: typeof body?.daily_earn_limit === 'number' ? body.daily_earn_limit : 1000,
    });

    return Response.json({ success: true, store });
  } catch (error) {
    console.error('Error creating store:', error);
    return Response.json({ error: 'Failed to create store' }, { status: 500 });
  }
});
