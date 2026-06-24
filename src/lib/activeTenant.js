/**
 * activeTenant.js — the "which business am I administering" context.
 *
 * Separates the two identities a single account can hold:
 *  - PLATFORM OWNER (role admin / is_owner): the Plataforma console is
 *    cross-tenant (all businesses). But the Administración section is scoped to
 *    ONE business at a time — the owner's own by default, or a tenant they chose
 *    to "enter" from the console (persisted in localStorage).
 *  - TENANT MEMBER (business_admin / staff): always their own business_id.
 *
 * This keeps the owner's platform view and a tenant view cleanly separate
 * instead of mixing every tenant's data into the admin pages.
 */
import { getAppRole, ROLES } from '@/lib/rbac';

const ID_KEY = 'pp_active_business_id';
const NAME_KEY = 'pp_active_business_name';

function ls() {
  try { return window.localStorage; } catch { return null; }
}

/** The business_id the Administración pages should scope to for this user. */
export function getActiveBusinessId(user) {
  if (!user) return null;
  if (getAppRole(user) === ROLES.OWNER) {
    return ls()?.getItem(ID_KEY) || user.business_id || null;
  }
  return user.business_id || null;
}

/** Friendly name of the active business (for the "Administrando: X" indicator). */
export function getActiveBusinessName(user) {
  if (!user) return null;
  if (getAppRole(user) === ROLES.OWNER) {
    return ls()?.getItem(NAME_KEY) || user.business_name || null;
  }
  return user.business_name || null;
}

/** Owner action: enter a specific tenant's administration context. */
export function setActiveBusiness(id, name) {
  const store = ls();
  if (!store) return;
  if (id) store.setItem(ID_KEY, id); else store.removeItem(ID_KEY);
  if (name) store.setItem(NAME_KEY, name); else store.removeItem(NAME_KEY);
}

/** Owner action: drop back to administering their own business. */
export function clearActiveBusiness() {
  const store = ls();
  if (!store) return;
  store.removeItem(ID_KEY);
  store.removeItem(NAME_KEY);
}

/** True when the owner is administering a tenant other than their own. */
export function isImpersonatingTenant(user) {
  if (!user || getAppRole(user) !== ROLES.OWNER) return false;
  const active = ls()?.getItem(ID_KEY);
  return Boolean(active) && active !== user.business_id;
}
