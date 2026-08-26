import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useMemberships, switchBusiness } from '@/lib/useMemberships';
import { Building2, Check, ChevronDown, Loader2, Plus, Store } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * BusinessSwitcher — Modulo 18 (jospabloh/acacia-app-standard -> STANDARD.md).
 *
 * The active business name, made switchable only once there are 2+
 * memberships — with one, it stays plain text: a dropdown arrow that opens a
 * menu of one is a lie about what the app can do. Same pattern as
 * jospabloh/ctrlhq's TenantSwitcher, the standard's reference implementation.
 *
 * Switching goes through switchBusiness() -> the switchBusiness function,
 * which re-derives Membership server-side before repointing business_id.
 * Everything on screen here is a label; the authorization lives server-side.
 */
export default function BusinessSwitcher({ user, className }) {
  const { memberships } = useMemberships(user);
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState({});
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const ref = useRef(null);

  const others = (memberships || []).filter((m) => m.business_id !== user?.business_id);
  const canSwitch = (memberships || []).length > 1;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !others.length) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        others.map(async (m) => {
          // Business.read RLS only grants id == user.data.business_id — the
          // active business. A Membership for a business that isn't active
          // right now isn't readable this way, so this degrades to the name
          // stored on the Membership row itself (set when it was created)
          // instead of failing.
          try {
            const rows = await base44.entities.Business.filter({ id: m.business_id });
            return [m.business_id, rows?.[0]?.name || m.business_name || 'Negocio sin nombre'];
          } catch {
            return [m.business_id, m.business_name || 'Negocio sin nombre'];
          }
        }),
      );
      if (!cancelled) setNames(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [open, memberships, user?.business_id]);

  const go = async (targetBusinessId) => {
    setError('');
    setBusyId(targetBusinessId);
    try {
      await switchBusiness(targetBusinessId);
      // switchBusiness() reloads the page on success — this catch only
      // covers the invoke itself failing before that.
    } catch (err) {
      setError(err?.message || 'No pudimos cambiar de negocio.');
      setBusyId('');
    }
  };

  const label = user?.business_name || 'Negocio';

  if (!canSwitch) return null;

  return (
    <div className={cn('relative min-w-0', className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-white/60"
      >
        <span className="truncate text-xs font-medium text-slate-500 dark:text-slate-400" title={label}>{label}</span>
        <ChevronDown className={cn('h-3 w-3 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white dark:bg-slate-900 p-1 shadow-lg">
          <p className="px-2 py-1.5 text-xs text-slate-400 dark:text-slate-500">Cambiar de negocio</p>
          {error && <p className="px-2 py-1.5 text-xs text-rose-600">{error}</p>}
          <div className="flex items-center gap-2 rounded-lg bg-violet-50/70 px-2 py-2">
            <Check className="h-3.5 w-3.5 shrink-0 text-violet-600" aria-hidden="true" />
            <span className="truncate text-sm">{label}</span>
          </div>
          {others.map((m) => (
            <button
              key={m.id || m.business_id}
              type="button"
              role="menuitem"
              disabled={!!busyId}
              onClick={() => go(m.business_id)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50 hover:dark:bg-slate-800 disabled:opacity-60"
            >
              {busyId === m.business_id ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
              ) : m.role === 'merchant' ? (
                <Store className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              ) : (
                <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              )}
              <span className="truncate text-sm">{names[m.business_id] || 'Cargando…'}</span>
            </button>
          ))}
          <a
            href={`${createPageUrl('Onboarding')}?join=1`}
            className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-slate-100 dark:border-slate-800 px-2 py-2 pt-2 text-left transition-colors hover:bg-slate-50 hover:dark:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="text-sm">Crear o unirme a otro</span>
          </a>
        </div>
      )}
    </div>
  );
}
