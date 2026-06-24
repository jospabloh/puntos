/**
 * rbac.js — Role-Based Access Control for Puntos+ (single source of truth).
 *
 * Puntos+ is a multi-tenant SaaS with four tiers. The Base44 built-in `role`
 * field carries the role used by Row-Level Security (RLS) on the backend, so the
 * names here must match exactly the strings used in the entity `.jsonc` RLS rules.
 *
 *   owner          -> Base44 role "admin"          Platform owner (ACACIA).
 *                                                  Cross-tenant. Service-role tier.
 *   business_admin -> Base44 role "business_admin" Tenant owner/admin. One tenant.
 *   staff          -> Base44 role "merchant"       Tenant cashier/operator. POS only.
 *   customer       -> Base44 role "customer"       End consumer. Own wallet only.
 *
 * IMPORTANT: client-side checks here are for UX (hiding controls, redirecting).
 * The authoritative enforcement is Base44 RLS at the data layer. Every privileged
 * action must ALSO be safe at the RLS level — never rely on rbac.js alone.
 */

export const ROLES = {
  OWNER: 'owner',
  BUSINESS_ADMIN: 'business_admin',
  STAFF: 'staff',
  CUSTOMER: 'customer',
};

export const ROLE_LABELS = {
  owner: 'Dueño de plataforma',
  business_admin: 'Administrador del negocio',
  staff: 'Equipo / Cajero',
  customer: 'Cliente',
};

export const ROLE_DESCRIPTIONS = {
  owner: 'ACACIA. Gestiona todos los negocios, licencias y soporte de la plataforma.',
  business_admin: 'Dueño del programa de lealtad de un negocio. Administra tiendas, equipo, recompensas y facturación.',
  staff: 'Opera el punto de venta: acumula y canjea puntos de los clientes de su tienda.',
  customer: 'Usa su monedero de puntos: ve saldo, ofertas, historial y canjea recompensas.',
};

/**
 * Map a Base44 user to a Puntos+ app role.
 *
 * Precedence is deliberate: platform owner first (so an owner is never demoted by
 * a stray tenant field), then explicit business_admin, then staff (covering both
 * the new `merchant` role and the legacy `merchant_role` field), else customer.
 */
export function getAppRole(user) {
  if (!user) return null;
  if (user.role === 'admin' || user.app_role === 'owner') return ROLES.OWNER;
  if (user.role === 'business_admin' || user.app_role === 'business_admin') return ROLES.BUSINESS_ADMIN;
  if (user.role === 'merchant' || user.merchant_role === 'merchant' || user.app_role === 'staff') return ROLES.STAFF;
  return ROLES.CUSTOMER;
}

export function isOwner(user) { return getAppRole(user) === ROLES.OWNER; }
export function isBusinessAdmin(user) { return getAppRole(user) === ROLES.BUSINESS_ADMIN; }
export function isStaff(user) { return getAppRole(user) === ROLES.STAFF; }
export function isCustomer(user) { return getAppRole(user) === ROLES.CUSTOMER; }
/** Anyone who operates a tenant back-office (owner acts across all tenants). */
export function isTenantManager(user) {
  const r = getAppRole(user);
  return r === ROLES.OWNER || r === ROLES.BUSINESS_ADMIN;
}

/**
 * PERMISSIONS — the canonical capability matrix.
 *
 * Key format: "<module>:<action>". Value: ordered list of roles that hold the
 * capability by default. This object is rendered verbatim by the in-app
 * Permissions page and mirrored in docs/PERMISSIONS.md. Add new capabilities here
 * with the narrowest safe default before shipping the feature.
 */
export const PERMISSIONS = {
  // Platform (owner-only) ----------------------------------------------------
  'platform:view_console': ['owner'],
  'tenants:view': ['owner'],
  'tenants:create': ['owner'],
  'tenants:update': ['owner'],
  'tenants:suspend': ['owner'],
  'tenants:delete': ['owner'],
  'licenses:view': ['owner'],
  'licenses:assign': ['owner'],
  'licenses:activate': ['owner'],
  'support:view_console': ['owner'],
  'support:reply_all': ['owner'],
  'support:internal_note': ['owner'],
  'platform:impersonate': ['owner'],

  // Tenant administration ----------------------------------------------------
  'business:view': ['owner', 'business_admin'],
  'business:update_settings': ['owner', 'business_admin'],
  'business:view_billing': ['owner', 'business_admin'],
  'business:request_upgrade': ['owner', 'business_admin'],
  'users:view': ['owner', 'business_admin'],
  'users:invite': ['owner', 'business_admin'],
  'users:update_role': ['owner', 'business_admin'],
  'users:remove': ['owner', 'business_admin'],
  'stores:view': ['owner', 'business_admin', 'staff'],
  'stores:create': ['owner', 'business_admin'],
  'stores:update': ['owner', 'business_admin'],
  'stores:delete': ['owner', 'business_admin'],
  'campaigns:view': ['owner', 'business_admin'],
  'campaigns:manage': ['owner', 'business_admin'],
  'offers:view': ['owner', 'business_admin', 'staff', 'customer'],
  'offers:manage': ['owner', 'business_admin'],
  'customers:view': ['owner', 'business_admin'],
  'customers:adjust_points': ['owner', 'business_admin'],
  'customers:export': ['owner', 'business_admin'],
  'audit:view': ['owner', 'business_admin'],
  'analytics:view': ['owner', 'business_admin'],

  // Point of sale ------------------------------------------------------------
  'pos:access': ['owner', 'business_admin', 'staff'],
  'pos:earn': ['owner', 'business_admin', 'staff'],
  'pos:burn': ['owner', 'business_admin', 'staff'],

  // Tenant-side support ------------------------------------------------------
  'support:create_ticket': ['owner', 'business_admin'],
  'support:view_own_tickets': ['owner', 'business_admin'],
  'support:reply_own': ['owner', 'business_admin'],

  // Customer-facing ----------------------------------------------------------
  'wallet:view': ['owner', 'business_admin', 'staff', 'customer'],
  'wallet:generate_pass': ['owner', 'business_admin', 'staff', 'customer'],
  'rewards:redeem': ['customer', 'owner'],
  'history:view_own': ['owner', 'business_admin', 'staff', 'customer'],
  'chat:use': ['owner', 'business_admin', 'staff', 'customer'],
  'profile:edit_own': ['owner', 'business_admin', 'staff', 'customer'],
};

/** Module display metadata for the in-app permissions matrix. */
export const PERMISSION_MODULES = [
  { key: 'platform', label: 'Plataforma', tier: 'owner' },
  { key: 'tenants', label: 'Negocios (Tenants)', tier: 'owner' },
  { key: 'licenses', label: 'Licencias', tier: 'owner' },
  { key: 'support', label: 'Soporte', tier: 'mixed' },
  { key: 'business', label: 'Negocio', tier: 'tenant' },
  { key: 'users', label: 'Usuarios', tier: 'tenant' },
  { key: 'stores', label: 'Tiendas', tier: 'tenant' },
  { key: 'campaigns', label: 'Campañas', tier: 'tenant' },
  { key: 'offers', label: 'Recompensas', tier: 'tenant' },
  { key: 'customers', label: 'Clientes', tier: 'tenant' },
  { key: 'audit', label: 'Auditoría', tier: 'tenant' },
  { key: 'analytics', label: 'Analítica', tier: 'tenant' },
  { key: 'pos', label: 'Punto de venta', tier: 'tenant' },
  { key: 'wallet', label: 'Monedero', tier: 'customer' },
  { key: 'rewards', label: 'Canjes', tier: 'customer' },
  { key: 'history', label: 'Historial', tier: 'customer' },
  { key: 'chat', label: 'Chat', tier: 'customer' },
  { key: 'profile', label: 'Perfil', tier: 'customer' },
];

/**
 * Does this user hold a capability? Pure UX helper — see file header.
 * Optionally pass a permission profile override (per-tenant PermissionProfile)
 * whose entries (key -> bool) take precedence over the default matrix.
 */
export function can(user, permissionKey, profileOverride = null) {
  const role = getAppRole(user);
  if (!role) return false;
  if (role === ROLES.OWNER) return true; // owner is the super-tier
  if (profileOverride && Object.prototype.hasOwnProperty.call(profileOverride, permissionKey)) {
    return Boolean(profileOverride[permissionKey]);
  }
  const allowed = PERMISSIONS[permissionKey];
  return Array.isArray(allowed) && allowed.includes(role);
}

/** Convenience for route guards: which landing page suits this role. */
export function homePageForRole(user) {
  switch (getAppRole(user)) {
    case ROLES.OWNER: return 'PlatformDashboard';
    case ROLES.BUSINESS_ADMIN: return 'AdminDashboard';
    case ROLES.STAFF: return 'MerchantPOS';
    default: return 'Home';
  }
}

/** Roles that may even reach a page, for client-side route gating. */
export const PAGE_ACCESS = {
  PlatformDashboard: ['owner'],
  PlatformTenants: ['owner'],
  PlatformLicenses: ['owner'],
  PlatformSupport: ['owner'],
  AdminDashboard: ['owner', 'business_admin'],
  AdminStores: ['owner', 'business_admin'],
  AdminCampaigns: ['owner', 'business_admin'],
  AdminCustomers: ['owner', 'business_admin'],
  AdminAudit: ['owner', 'business_admin'],
  BusinessSettings: ['owner', 'business_admin'],
  BusinessUsers: ['owner', 'business_admin'],
  BusinessBilling: ['owner', 'business_admin'],
  BusinessSupport: ['owner', 'business_admin'],
  MerchantPOS: ['owner', 'business_admin', 'staff'],
  Permissions: ['owner', 'business_admin', 'staff', 'customer'],
  Home: ['owner', 'business_admin', 'staff', 'customer'],
  Wallet: ['owner', 'business_admin', 'staff', 'customer'],
  Offers: ['owner', 'business_admin', 'staff', 'customer'],
  History: ['owner', 'business_admin', 'staff', 'customer'],
  Chat: ['owner', 'business_admin', 'staff', 'customer'],
  Profile: ['owner', 'business_admin', 'staff', 'customer'],
};

export function canAccessPage(user, pageName) {
  const allowed = PAGE_ACCESS[pageName];
  if (!allowed) return true; // unlisted pages are open to any authenticated user
  const role = getAppRole(user);
  return role === ROLES.OWNER || allowed.includes(role);
}
