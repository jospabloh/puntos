import { base44 } from '@/api/base44Client';

/**
 * Client wrapper over base44/functions/guardedEntityWrite — the sanctioned
 * write path for the tenant-admin surface (Campaign, Offer, Store, Invitation,
 * PermissionProfile, and a Business's own settings fields).
 *
 * These used to be written straight from the browser with
 * base44.entities.X.create/update/delete(), which meant `can()` and the
 * PermissionProfile override layer were pure UI: RLS enforces tenant isolation
 * and the coarse role branches, but cannot see a per-tenant override row or
 * Business.billing_status (both live on a different row, and Base44 RLS
 * templates can't join). See the function's header comment.
 *
 * Same calling shape as the entity SDK it replaces — data in, record out — so
 * a migrated call site reads the same as before. Throws with the function's
 * own error string so existing onError handlers keep working.
 */

async function invoke(payload) {
  const res = await base44.functions.invoke('guardedEntityWrite', payload);
  const body = res?.data;
  if (!body?.success) {
    throw new Error(body?.error === 'write_blocked'
      ? 'Tu cuenta es de solo lectura. Regulariza tu licencia para volver a hacer cambios.'
      : body?.error || 'No se pudo completar la operación');
  }
  return body.record;
}

export function guardedCreate(entity, data) {
  return invoke({ entity, operation: 'create', data });
}

export function guardedUpdate(entity, id, data) {
  return invoke({ entity, operation: 'update', id, data });
}

export function guardedDelete(entity, id) {
  return invoke({ entity, operation: 'delete', id });
}
