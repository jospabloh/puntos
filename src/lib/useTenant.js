/**
 * useTenant.js — current-tenant context + license lifecycle helpers.
 *
 * A tenant is a Business record. The signed-in user carries `business_id`
 * (except the platform owner, who is cross-tenant). This hook loads the active
 * Business and derives its license posture so pages can gate features and show
 * trial / billing banners consistently.
 */
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getPlan, planHasFeature, checkLimit, TRIAL_DAYS } from '@/lib/licensePlans';
import { getAppRole, ROLES } from '@/lib/rbac';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days remaining until a date (can be negative). Null-safe. */
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / DAY_MS);
}

/**
 * Derive the license posture of a Business record. Pure function so it can be
 * unit-tested and reused server-side conceptually.
 *
 * Returns: {
 *   plan, billingStatus, isTrial, isActive, isViewOnly, isSuspended, isArchived,
 *   trialDaysLeft, licenseDaysLeft, expired, banner: { tone, title, message } | null
 * }
 */
export function deriveLicense(business) {
  if (!business) {
    return {
      plan: getPlan('starter'),
      billingStatus: 'unknown',
      isTrial: false, isActive: false, isViewOnly: false,
      isSuspended: false, isArchived: false,
      trialDaysLeft: null, licenseDaysLeft: null, expired: false,
      banner: null,
    };
  }
  const plan = getPlan(business.license_plan);
  const billingStatus = business.billing_status || 'trial';
  const trialDaysLeft = daysUntil(business.trial_end_at);
  const licenseDaysLeft = daysUntil(business.license_expires_at);

  const isTrial = billingStatus === 'trial';
  const isActive = billingStatus === 'active';
  const isViewOnly = billingStatus === 'view_only';
  const isSuspended = billingStatus === 'suspended' || business.status === 'suspended';
  const isArchived = billingStatus === 'archived';
  const expired =
    (isTrial && trialDaysLeft !== null && trialDaysLeft < 0) ||
    (isActive && licenseDaysLeft !== null && licenseDaysLeft < 0);

  let banner = null;
  if (isArchived) {
    banner = { tone: 'critical', title: 'Negocio archivado', message: 'Este negocio está archivado. Contacta a soporte para reactivarlo.' };
  } else if (isSuspended) {
    banner = { tone: 'critical', title: 'Cuenta suspendida', message: 'El acceso está suspendido. Contacta a soporte para regularizar tu licencia.' };
  } else if (isViewOnly) {
    banner = { tone: 'warning', title: 'Modo solo lectura', message: 'Tu licencia venció. Puedes consultar tus datos pero no registrar operaciones. Renueva para reactivar el punto de venta.' };
  } else if (isTrial && trialDaysLeft !== null) {
    if (trialDaysLeft < 0) {
      banner = { tone: 'critical', title: 'Prueba finalizada', message: 'Tu prueba gratuita terminó. Activa una licencia para seguir operando.' };
    } else if (trialDaysLeft <= 7) {
      banner = { tone: 'warning', title: `Quedan ${trialDaysLeft} día${trialDaysLeft === 1 ? '' : 's'} de prueba`, message: 'Activa una licencia antes de que termine tu prueba para no perder acceso.' };
    } else {
      banner = { tone: 'info', title: `Prueba gratuita — ${trialDaysLeft} días restantes`, message: `Estás explorando Puntos+ con el plan ${plan.name}. Sin compromiso.` };
    }
  } else if (isActive && licenseDaysLeft !== null && licenseDaysLeft <= 7) {
    banner = { tone: 'warning', title: `Licencia por vencer (${licenseDaysLeft} días)`, message: 'Renueva tu licencia para evitar interrupciones.' };
  }

  return {
    plan, billingStatus,
    isTrial, isActive, isViewOnly, isSuspended, isArchived,
    trialDaysLeft, licenseDaysLeft, expired, banner,
  };
}

/** Can this tenant currently write (register operations)? */
export function canTenantWrite(business) {
  const lic = deriveLicense(business);
  return !(lic.isViewOnly || lic.isSuspended || lic.isArchived);
}

/**
 * useTenant — React Query hook returning the active Business + license posture.
 * For the platform owner, returns business = null (cross-tenant) unless an
 * explicit businessId is provided (e.g. impersonation / detail view).
 */
export function useTenant(user, businessIdOverride = null) {
  const role = getAppRole(user);
  const businessId = businessIdOverride || user?.business_id;
  const enabled = Boolean(businessId) && role !== ROLES.OWNER || Boolean(businessIdOverride);

  const query = useQuery({
    queryKey: ['tenant', businessId],
    enabled: Boolean(businessId) && (role !== ROLES.OWNER || Boolean(businessIdOverride)),
    queryFn: async () => {
      const list = await base44.entities.Business.filter({ id: businessId });
      return list?.[0] || null;
    },
  });

  const business = query.data || null;
  const license = deriveLicense(business);

  return {
    business,
    license,
    isLoading: enabled ? query.isLoading : false,
    refetch: query.refetch,
    hasFeature: (feature) => planHasFeature(business?.license_plan, feature),
    checkLimit: (limitKey, used) => checkLimit(business?.license_plan, limitKey, used),
    canWrite: canTenantWrite(business),
  };
}

export { TRIAL_DAYS };
