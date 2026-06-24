/**
 * useCurrentUser — single hook every page uses to load the signed-in Base44 user
 * and derive their Puntos+ role. Wraps base44.auth.me() in React Query so the
 * result is cached and shared across components in a render pass.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { getAppRole, canAccessPage, homePageForRole } from '@/lib/rbac';

export function useCurrentUser() {
  const query = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      try {
        const u = await base44.auth.me();
        if (!u) return null;
        // Base44 stores custom user fields under `data`. Flatten them to the top
        // level so consumers can read user.business_id / user.storeId uniformly,
        // while built-in top-level fields (role, email, full_name, id) win.
        const fu = (u.data && typeof u.data === 'object') ? { ...u.data, ...u } : { ...u };
        // Resolve platform context server-side (APP_OWNER_EMAIL is a server secret
        // the client can't read). Recognizes the configured owner and self-heals
        // their role to admin. Best-effort: harmless if the function isn't live.
        try {
          const ctx = await base44.functions.invoke('getAppContext');
          if (ctx?.data) {
            fu.is_owner = Boolean(ctx.data.isOwner);
            fu.support_email = ctx.data.supportEmail || null;
            if (ctx.data.isOwner && ctx.data.role === 'admin') fu.role = 'admin';
          }
        } catch { /* getAppContext optional */ }
        return fu;
      } catch (e) {
        return null;
      }
    },
    staleTime: 60_000,
  });
  const user = query.data || null;
  return {
    user,
    role: getAppRole(user),
    isLoading: query.isLoading,
    isAuthenticated: Boolean(user),
    refetch: query.refetch,
  };
}

/**
 * useRequirePage — page-level guard. Redirects unauthenticated users to login and
 * users without access to their role's home page. Returns { user, role, ready }.
 * `ready` is true only once the user is loaded AND allowed, so pages can render a
 * loader until then.
 */
export function useRequirePage(pageName) {
  const { user, role, isLoading } = useCurrentUser();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      base44.auth.redirectToLogin(window.location.href);
      return;
    }
    if (!canAccessPage(user, pageName)) {
      window.location.href = createPageUrl(homePageForRole(user));
    }
  }, [isLoading, user, pageName]);

  const ready = !isLoading && !!user && canAccessPage(user, pageName);
  return { user, role, ready, isLoading };
}
