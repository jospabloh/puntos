/**
 * licensePlans.js — Puntos+ license plan catalog (single source of truth).
 *
 * The platform owner (ACACIA) sells Puntos+ as a multi-tenant SaaS. Each tenant
 * (Business) is on exactly one plan. A plan defines hard limits (enforced both
 * client-side for UX and server-side via RLS / serverless guards) and the set of
 * feature flags the tenant unlocks.
 *
 * Limits use -1 to mean "unlimited".
 *
 * Keep this in sync with:
 *   - base44/entities/Business.jsonc  (license_plan enum)
 *   - docs/PERMISSIONS.md             (plan/feature matrix)
 */

export const PLAN_ORDER = ['starter', 'growth', 'pro', 'enterprise'];

export const LICENSE_PLANS = {
  starter: {
    key: 'starter',
    name: 'Starter',
    tagline: 'Para un solo local que empieza con lealtad',
    monthly_price_mxn: 0,
    annual_price_mxn: 0,
    is_free: true,
    accent: '#10b981', // emerald
    limits: {
      stores: 1,
      staff_users: 2,
      customers: 250,
      active_offers: 5,
      active_campaigns: 1,
      monthly_transactions: 1000,
    },
    features: {
      pos: true,
      offers: true,
      campaigns: false,
      wallet_passes: false,
      analytics_advanced: false,
      referrals: false,
      ai_assistant: false,
      custom_branding: false,
      api_access: false,
      priority_support: false,
      data_export: false,
      tiers: true,
    },
  },
  growth: {
    key: 'growth',
    name: 'Growth',
    tagline: 'Varios locales y campañas que mueven la aguja',
    monthly_price_mxn: 899,
    annual_price_mxn: 8990,
    accent: '#6366f1', // indigo
    popular: true,
    limits: {
      stores: 5,
      staff_users: 10,
      customers: 5000,
      active_offers: 30,
      active_campaigns: 10,
      monthly_transactions: 25000,
    },
    features: {
      pos: true,
      offers: true,
      campaigns: true,
      wallet_passes: true,
      analytics_advanced: true,
      referrals: true,
      ai_assistant: false,
      custom_branding: true,
      api_access: false,
      priority_support: false,
      data_export: true,
      tiers: true,
    },
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    tagline: 'Cadenas que operan lealtad como ventaja competitiva',
    monthly_price_mxn: 2490,
    annual_price_mxn: 24900,
    accent: '#a855f7', // violet
    limits: {
      stores: 25,
      staff_users: 50,
      customers: 50000,
      active_offers: -1,
      active_campaigns: -1,
      monthly_transactions: 250000,
    },
    features: {
      pos: true,
      offers: true,
      campaigns: true,
      wallet_passes: true,
      analytics_advanced: true,
      referrals: true,
      ai_assistant: true,
      custom_branding: true,
      api_access: true,
      priority_support: true,
      data_export: true,
      tiers: true,
    },
  },
  enterprise: {
    key: 'enterprise',
    name: 'Enterprise',
    tagline: 'Operación a la medida con acuerdos de servicio',
    monthly_price_mxn: null, // "Contáctanos"
    annual_price_mxn: null,
    accent: '#0ea5e9', // sky
    limits: {
      stores: -1,
      staff_users: -1,
      customers: -1,
      active_offers: -1,
      active_campaigns: -1,
      monthly_transactions: -1,
    },
    features: {
      pos: true,
      offers: true,
      campaigns: true,
      wallet_passes: true,
      analytics_advanced: true,
      referrals: true,
      ai_assistant: true,
      custom_branding: true,
      api_access: true,
      priority_support: true,
      data_export: true,
      tiers: true,
    },
  },
};

export const FEATURE_LABELS = {
  pos: 'Punto de venta',
  offers: 'Catálogo de recompensas',
  campaigns: 'Campañas y multiplicadores',
  wallet_passes: 'Pases Apple / Google Wallet',
  analytics_advanced: 'Analítica avanzada',
  referrals: 'Programa de referidos',
  ai_assistant: 'Asistente con IA',
  custom_branding: 'Marca personalizada',
  api_access: 'Acceso a API',
  priority_support: 'Soporte prioritario',
  data_export: 'Exportación de datos',
  tiers: 'Niveles de membresía',
};

export const LIMIT_LABELS = {
  stores: 'Tiendas',
  staff_users: 'Usuarios de equipo',
  customers: 'Clientes',
  active_offers: 'Recompensas activas',
  active_campaigns: 'Campañas activas',
  monthly_transactions: 'Transacciones / mes',
};

export const TRIAL_DAYS = 30;

/** Resolve a plan object from a plan key, falling back to starter. */
export function getPlan(planKey) {
  return LICENSE_PLANS[planKey] || LICENSE_PLANS.starter;
}

/** True if a numeric limit is unlimited. */
export function isUnlimited(value) {
  return value === -1 || value === null || value === undefined;
}

/** Human-friendly limit value ("Ilimitado" for -1). */
export function formatLimit(value) {
  return isUnlimited(value) ? 'Ilimitado' : value.toLocaleString('es-MX');
}

/**
 * Does `plan` allow `feature`? Unknown features default to false so a typo can
 * never silently unlock something.
 */
export function planHasFeature(planKey, feature) {
  return Boolean(getPlan(planKey).features?.[feature]);
}

/**
 * Limit check for a tenant. Returns { allowed, limit, used, remaining, unlimited }.
 * `used` is the current count of the resource for the tenant.
 */
export function checkLimit(planKey, limitKey, used = 0) {
  const limit = getPlan(planKey).limits?.[limitKey];
  if (isUnlimited(limit)) {
    return { allowed: true, limit: -1, used, remaining: Infinity, unlimited: true };
  }
  return {
    allowed: used < limit,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    unlimited: false,
  };
}

export function formatMoney(amount, currency = 'MXN') {
  if (amount === null || amount === undefined) return 'Contáctanos';
  if (amount === 0) return 'Gratis';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}
