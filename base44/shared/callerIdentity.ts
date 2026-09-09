// callerIdentity — módulo 22 del estándar ACACIA.
//
// `base44.auth.me()` es la vista de SESIÓN del usuario, y está cacheada: es
// barata de llamar en cada petición justo porque no vuelve a la base. Esa misma
// propiedad la hace la fuente equivocada para decidir una ESCRITURA.
//
// Todos los campos que este repo trata como autoritativos del servidor
// (`role`, `app_role`, `business_id`, `storeId`, `store_id`, `merchant_role`)
// llevan `rls.write` restringido a `role:admin` — sólo los escribe una función
// de servicio: `switchBusiness`, `manageTeamMember`, `acceptInvitation`,
// `createBusiness`. En cuanto una de ellas escribe, el `auth.me()` que otra
// petición ya tenía en mano queda viejo. Rumbo perdió dos rondas de
// diagnóstico por exactamente esto: `switchTenant` comparó contra el
// `auth.me()` cacheado, vio que "ya estaba" en el inquilino destino, se saltó
// la escritura y devolvió `ok: true` sin haber cambiado nada.
//
// Reglas, y son las del módulo 22:
//   - `auth.me()` sirve para la IDENTIDAD (`user.id`, `user.email`) y para
//     cualquier cosa de sólo lectura. Nada más.
//   - Cualquier función que compare un campo autoritativo para decidir si
//     escribe, o para saber EN QUÉ inquilino escribe, resuelve primero con
//     `resolveCaller()`, que re-lee el registro `User` como servicio.
//   - Un patch parcial se construye sobre el objeto recién leído
//     (`{ ...caller.data, ...patch }`), nunca sobre el cacheado.
//
// Falla cerrado: si el registro almacenado no se puede leer, devuelve `null` y
// quien llama responde 403. Un `User` que `auth.me()` resolvió siempre existe
// para el servicio (que se salta la RLS), así que no poder leerlo no es un caso
// normal que convenga tapar con la vista cacheada — que es justo lo que este
// módulo prohíbe.
//
// Vive en `base44/shared/` porque desde aquí SÍ se puede importar entre
// directorios de función: `scheduledGuard.ts` lleva haciéndolo desde hace
// meses en cuatro funciones programadas y desplegadas. (El CLAUDE.md de este
// repo afirmaba lo contrario; ese es el motivo de que `isBusinessWriteBlocked`
// y `getAppRole` estén copiadas a mano en media docena de sitios.)

export interface CallerIdentity {
  /** Id del usuario, tomado del token — no del registro re-leído. */
  id: string;
  email: string;
  /** Rol de Base44 tal y como está ALMACENADO ahora mismo. */
  role: string;
  /** Rol de aplicación resuelto (owner | business_admin | staff | customer). */
  appRole: string;
  /** Inquilino almacenado del llamante, o null. */
  businessId: string | null;
  businessName: string;
  /** Tienda almacenada del llamante (storeId gana; store_id es su alias). */
  storeId: string | null;
  /** El registro re-leído entero, para construir patches parciales encima. */
  data: Record<string, any>;
}

/** Un campo custom puede llegar plano o bajo `data.` según la ruta del SDK. */
function pick(u: Record<string, any> | null, key: string): any {
  return u?.[key] ?? u?.data?.[key];
}

/**
 * Misma resolución que `getAppRole()` en el cliente (`src/lib/rbac.js`).
 * Exportada para que las funciones que ya la duplicaban puedan dejar de
 * hacerlo — el rol que reciba debe venir del registro almacenado.
 */
export function resolveAppRole(user: Record<string, any> | null): string {
  const role = pick(user, 'role');
  if (role === 'admin') return 'owner';
  if (role === 'business_admin') return 'business_admin';
  if (role === 'merchant') return 'staff';
  if (pick(user, 'merchant_role') === 'merchant') return 'staff';
  return 'customer';
}

/**
 * Re-lee el registro `User` del llamante como servicio y devuelve su identidad
 * autoritativa. `sessionUser` es lo que dio `auth.me()`: de él sólo se usan
 * `id` y `email`.
 *
 * Devuelve `null` si el registro no se puede leer — quien llama debe responder
 * 403, nunca continuar con la vista cacheada.
 */
export async function resolveCaller(
  base44: any,
  sessionUser: Record<string, any> | null,
): Promise<CallerIdentity | null> {
  const id = sessionUser?.id;
  if (!id) return null;

  let stored: Record<string, any> | null = null;
  try {
    stored = await base44.asServiceRole.entities.User.get(id);
  } catch {
    stored = null;
  }
  if (!stored) return null;

  const storeId = pick(stored, 'storeId') || pick(stored, 'store_id') || null;

  return {
    id,
    email: sessionUser?.email || stored.email || '',
    role: pick(stored, 'role') || 'customer',
    appRole: resolveAppRole(stored),
    businessId: pick(stored, 'business_id') || null,
    businessName: pick(stored, 'business_name') || '',
    storeId,
    data: (stored.data && typeof stored.data === 'object') ? stored.data : stored,
  };
}

/** 403 uniforme para cuando el registro almacenado del llamante no se pudo leer. */
export function unresolvedCallerResponse(): Response {
  return Response.json(
    { error: 'forbidden', reason: 'caller_record_unavailable' },
    { status: 403 },
  );
}
