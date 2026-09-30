// deno-lint-ignore-file no-explicit-any
// joinRequestRules — reglas puras (sin imports) de la unión por código.
//
// Contrato (2026-09-30): redimir el código de invitación del negocio NO da
// acceso. Crea una JoinRequest `pending`; sólo un business_admin de ESE negocio
// (o el dueño de plataforma) la aprueba, y al aprobar ELIGE el rol. Vive aparte
// de `manageJoinRequest/entry.ts` para poder probarse con `deno test` sin
// resolver `npm:@base44/sdk`, que el sandbox de desarrollo no alcanza.

/** Roles que una aprobación puede otorgar. Nunca `admin` (plataforma) ni owner. */
export const GRANTABLE_ROLES = ['business_admin', 'staff'] as const;
export type GrantableRole = typeof GRANTABLE_ROLES[number];

export interface RoleGrant {
  /** Valor de User.role (rol de plataforma de Base44 con el que RLS decide). */
  role: 'business_admin' | 'merchant';
  /** Valor de User.app_role. */
  appRole: 'business_admin' | 'staff';
  /** Valor de User.merchant_role ('' para admin). */
  merchantRole: 'merchant' | '';
}

/**
 * Traduce el rol elegido por el admin a los campos del User. `merchant` se
 * acepta como alias de `staff` (así lo llama `manageTeamMember`). Cualquier
 * otra cosa —incluidos `admin`, `owner`, `customer`— devuelve null.
 */
export function grantForRole(input: unknown): RoleGrant | null {
  if (input === 'business_admin') {
    return { role: 'business_admin', appRole: 'business_admin', merchantRole: '' };
  }
  if (input === 'staff' || input === 'merchant') {
    return { role: 'merchant', appRole: 'staff', merchantRole: 'merchant' };
  }
  return null;
}

/** Códigos: mayúsculas, sin espacios ni guiones. Vacío si no es texto. */
export function normalizeInviteCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[\s-]/g, '').slice(0, 20);
}

/** Estados de licencia en los que el negocio no acepta gente nueva. */
export function businessBlocksJoining(business: Record<string, any> | null): boolean {
  if (!business) return true;
  if (business.invite_code_active === false) return true;
  if (business.status === 'suspended') return true;
  return ['view_only', 'suspended', 'archived'].includes(business.billing_status);
}

/** Licencia en solo lectura/suspendida: no se otorga acceso nuevo (mismo criterio que canTenantWrite). */
export function businessWritesBlocked(business: Record<string, any> | null): boolean {
  if (!business) return false;
  const status = business.billing_status || 'trial';
  return ['view_only', 'suspended', 'archived'].includes(status) || business.status === 'suspended';
}

/** Máximo de solicitudes pendientes por negocio (evita inundar al admin). */
export const MAX_PENDING_PER_BUSINESS = 25;

export type ResolveDenied = 'not_found' | 'not_pending';

/**
 * ¿Puede `caller` resolver `request`? No filtra existencia: una solicitud de
 * otro negocio responde igual que una inexistente (sin oráculo).
 */
export function checkResolvable(
  request: Record<string, any> | null,
  caller: { role: string; businessId: string | null },
): ResolveDenied | null {
  if (!request) return 'not_found';
  const isPlatform = caller.role === 'admin';
  if (!isPlatform && (!caller.businessId || request.business_id !== caller.businessId)) return 'not_found';
  if (request.status !== 'pending') return 'not_pending';
  return null;
}
