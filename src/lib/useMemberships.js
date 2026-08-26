/**
 * useMemberships — Modulo 18 (jospabloh/acacia-app-standard -> STANDARD.md).
 *
 * Loads the signed-in user's own Membership rows: one per (business_id) they
 * belong to as business_admin or staff. Membership.read RLS keys on
 * data.user_id, not the active business_id, so this always returns every
 * business the caller belongs to regardless of which one is currently active
 * — that's what lets the switcher list businesses the user is NOT currently
 * administering/staffing.
 *
 * The platform owner has no Membership rows (see createBusiness/entry.ts and
 * acceptInvitation/entry.ts — a Membership is never created for role:admin)
 * and doesn't need any: they're already cross-tenant.
 */
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useMemberships(user) {
  const query = useQuery({
    queryKey: ['memberships', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const rows = await base44.entities.Membership.filter({ user_id: user.id });
      return rows || [];
    },
    staleTime: 60_000,
  });
  return {
    memberships: query.data || [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

/**
 * switchBusiness — invokes the switchBusiness function then hard-reloads the
 * page. Every screen's data was fetched for the business that was active
 * when it loaded, so a full reload is the honest way to make sure nothing
 * from the previous business survives on screen (same reasoning every other
 * app in this portfolio's Modulo 18 uses).
 */
export async function switchBusiness(targetBusinessId) {
  const res = await base44.functions.invoke('switchBusiness', { business_id: targetBusinessId });
  if (!res?.data?.success) {
    throw new Error(res?.data?.error || 'No pudimos cambiar de negocio.');
  }
  window.location.reload();
}
