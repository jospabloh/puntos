// Sin imports externos a propósito: deno.land y jsr.io están bloqueados en el
// sandbox de desarrollo. Corre con: deno test base44/shared/
import {
  businessBlocksJoining,
  businessWritesBlocked,
  checkResolvable,
  grantForRole,
  normalizeInviteCode,
} from './joinRequestRules.ts';

function eq(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} esperado ${e}, obtenido ${a}`);
}

Deno.test('grantForRole: sólo business_admin y staff (merchant es alias)', () => {
  eq(grantForRole('business_admin'), { role: 'business_admin', appRole: 'business_admin', merchantRole: '' });
  eq(grantForRole('staff'), { role: 'merchant', appRole: 'staff', merchantRole: 'merchant' });
  eq(grantForRole('merchant'), { role: 'merchant', appRole: 'staff', merchantRole: 'merchant' });
});

Deno.test('grantForRole: nunca admin/owner/customer ni basura', () => {
  for (const bad of ['admin', 'owner', 'customer', 'user', '', null, undefined, 1, {}, ['staff'], 'Business_Admin']) {
    eq(grantForRole(bad), null, `rol ${JSON.stringify(bad)}`);
  }
});

Deno.test('normalizeInviteCode', () => {
  eq(normalizeInviteCode(' ab-c 23 '), 'ABC23');
  eq(normalizeInviteCode(undefined), '');
  eq(normalizeInviteCode({}), '');
  eq(normalizeInviteCode('x'.repeat(50)).length, 20);
});

Deno.test('businessBlocksJoining', () => {
  eq(businessBlocksJoining(null), true);
  eq(businessBlocksJoining({ invite_code_active: false }), true);
  eq(businessBlocksJoining({ billing_status: 'suspended' }), true);
  eq(businessBlocksJoining({ billing_status: 'view_only' }), true);
  eq(businessBlocksJoining({ status: 'suspended', billing_status: 'active' }), true);
  eq(businessBlocksJoining({ billing_status: 'trial' }), false);
  eq(businessBlocksJoining({ billing_status: 'active', invite_code_active: true }), false);
});

Deno.test('checkResolvable: otro negocio = no existe (sin oráculo)', () => {
  const req = { business_id: 'b1', status: 'pending' };
  eq(checkResolvable(null, { role: 'business_admin', businessId: 'b1' }), 'not_found');
  eq(checkResolvable(req, { role: 'business_admin', businessId: 'b2' }), 'not_found');
  eq(checkResolvable(req, { role: 'business_admin', businessId: null }), 'not_found');
  eq(checkResolvable(req, { role: 'business_admin', businessId: 'b1' }), null);
  eq(checkResolvable(req, { role: 'admin', businessId: null }), null);
  eq(checkResolvable({ ...req, status: 'approved' }, { role: 'business_admin', businessId: 'b1' }), 'not_pending');
});

Deno.test('businessWritesBlocked: el código apagado NO bloquea aprobar pendientes', () => {
  eq(businessWritesBlocked({ invite_code_active: false, billing_status: 'active' }), false);
  eq(businessWritesBlocked({ billing_status: 'view_only' }), true);
  eq(businessWritesBlocked({ billing_status: 'archived' }), true);
  eq(businessWritesBlocked({ status: 'suspended' }), true);
  eq(businessWritesBlocked({}), false);
});
