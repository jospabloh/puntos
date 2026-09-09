import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Monitor, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { currentSessionId } from '@/hooks/useSessionManager';

/**
 * Module 20, Layer 2 — the other devices this account is logged in on,
 * surfaced rather than silently tracked.
 *
 * The point of keeping an `AppSession` row per device is not the row: it is
 * that a device the user has never authorized showing up in this list is an
 * account-compromise signal. Burying that in a table only Mission Control
 * reads gives the operator the signal and not the person it happens to, so
 * the standard puts it in the danger zone, where the user already goes to
 * check what their account is doing.
 *
 * Everything here uses the caller's own rows: `AppSession`'s RLS scopes reads
 * and writes by the built-in `created_by_id`, which Base44 stamps on create
 * and a client cannot forge. Revoking writes `revoked_at`, the same marker
 * Mission Control's `sessions.revoke` and the `purgeStaleSessions` reap job
 * use — so the revoked device's next heartbeat raises its
 * `SessionExpiredDialog`, no matter which of the three did the revoking.
 */

function relativeTime(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return 'hace un momento';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'ahora mismo';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'hace 1 día' : `hace ${days} días`;
}

export default function ActiveSessions({ user }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(null);
  const thisSession = currentSessionId();

  const load = useCallback(async () => {
    if (!user?.email) return;
    try {
      // Filtered by email rather than listed: the platform owner's RLS branch
      // is `role: admin`, which would otherwise hand them every operator's
      // sessions on their own profile screen.
      const rows = await base44.entities.AppSession.filter(
        { user_email: user.email }, '-last_active_at', 25,
      );
      setSessions((rows || []).filter((r) => !r.revoked_at));
    } catch {
      setSessions([]); // best-effort, same posture as the heartbeat itself
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => { load(); }, [load]);

  const revoke = async (id) => {
    setRevoking(id);
    try {
      await base44.entities.AppSession.update(id, { revoked_at: new Date().toISOString() });
      toast.success('Sesión cerrada en ese dispositivo.');
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast.error('No se pudo cerrar esa sesión. Inténtalo de nuevo.');
    } finally {
      setRevoking(null);
    }
  };

  if (loading || sessions.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Monitor className="h-5 w-5 text-slate-500 dark:text-slate-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-slate-900 dark:text-slate-50">Dispositivos con tu sesión abierta</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Si no reconoces alguno, ciérralo aquí y cambia tu contraseña.
            </p>
          </div>
        </div>

        <ul className="space-y-2">
          {sessions.map((s) => {
            const isThis = s.id === thisSession;
            return (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-xl border border-slate-100 dark:border-slate-800 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">
                    {s.device || 'Navegador'}
                    {isThis && <Badge className="ml-2 align-middle" variant="secondary">Este dispositivo</Badge>}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Activo {relativeTime(s.last_active_at || s.started_at)}
                  </p>
                </div>
                {!isThis && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={revoking === s.id}
                    onClick={() => revoke(s.id)}
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-400"
                  >
                    <ShieldOff className="h-4 w-4 mr-1.5" />
                    {revoking === s.id ? 'Cerrando…' : 'Cerrar'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
