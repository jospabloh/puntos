/**
 * Back-office UI kit — the shared visual language for every Puntos+ management
 * surface (owner console + tenant admin). Built on the shadcn primitives but
 * with the Puntos+ identity baked in, so pages stay consistent without each one
 * re-inventing headers, stat tiles, and status pills.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

/* Padded max-width container for a back-office page. The tinted control-room
   background is supplied by the Layout's sidebar shell, so this is just spacing. */
export function PageShell({ children, className }) {
  return (
    <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 md:pb-12', className)}>
      {children}
    </div>
  );
}

/* Page header with eyebrow, title, optional description and trailing actions. */
export function PageHeader({ eyebrow, title, description, icon: Icon, actions, accent = 'violet' }) {
  const ring = {
    violet: 'from-violet-500 to-fuchsia-500 shadow-violet-500/30',
    gold: 'from-amber-400 to-amber-500 shadow-amber-500/30',
    pink: 'from-pink-500 to-rose-500 shadow-pink-500/30',
    sky: 'from-sky-500 to-indigo-500 shadow-sky-500/30',
  }[accent] || 'from-violet-500 to-fuchsia-500 shadow-violet-500/30';

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-7">
      <div className="flex items-start gap-4">
        {Icon && (
          <div className={cn('hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg', ring)}>
            <Icon className="h-6 w-6" />
          </div>
        )}
        <div>
          {eyebrow && (
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500/80">{eyebrow}</div>
          )}
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-50 leading-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* A KPI tile. `tone` colors the icon chip; `delta` renders a trend chip. */
export function StatTile({ label, value, sublabel, icon: Icon, tone = 'violet', delta, loading }) {
  const tones = {
    violet: 'bg-violet-100 text-violet-600',
    gold: 'bg-amber-100 text-amber-600',
    pink: 'bg-pink-100 text-pink-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    sky: 'bg-sky-100 text-sky-600',
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
    rose: 'bg-rose-100 text-rose-600',
  };
  return (
    <Card className="pp-card-hover border-slate-200/70 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
        {Icon && (
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', tones[tone] || tones.violet)}>
            <Icon className="h-4.5 w-4.5" />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end gap-2">
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-slate-300 dark:text-slate-600" />
        ) : (
          <span className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 tnum">{value}</span>
        )}
        {delta && (
          <span className={cn('mb-1 rounded-full px-2 py-0.5 text-xs font-semibold',
            delta.dir === 'up' ? 'bg-emerald-50 text-emerald-600' : delta.dir === 'down' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400')}>
            {delta.label}
          </span>
        )}
      </div>
      {sublabel && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{sublabel}</p>}
    </Card>
  );
}

/* A titled content section. */
export function SectionCard({ title, description, actions, children, className, bodyClassName, icon: Icon }) {
  return (
    <Card className={cn('border-slate-200/70 overflow-hidden', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && <Icon className="h-4.5 w-4.5 shrink-0 text-violet-500" />}
            <div className="min-w-0">
              {title && <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50 truncate">{title}</h3>}
              {description && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </Card>
  );
}

const PILL_TONES = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  trial: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  view_only: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  suspended: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  archived: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-500/20',
  open: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  in_progress: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  waiting_customer: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  resolved: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  closed: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-500/20',
  urgent: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  high: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  normal: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-500/20',
  low: 'bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 ring-slate-400/20',
  default: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-500/20',
};

/* A status chip keyed by a known status string (falls back gracefully). */
export function StatusPill({ status, label, className }) {
  const tone = PILL_TONES[status] || PILL_TONES.default;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', tone, className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label || (status ? status.replace(/_/g, ' ') : '—')}
    </span>
  );
}

/* Plan badge with the plan's accent color. */
export function PlanBadge({ plan, className }) {
  const map = {
    starter: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    growth: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
    pro: 'bg-violet-50 text-violet-700 ring-violet-600/20',
    enterprise: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  };
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset', map[plan] || map.starter, className)}>
      {plan || 'starter'}
    </span>
  );
}

/* Empty / zero-state with optional call to action. */
export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-white/60 px-6 py-12 text-center', className)}>
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-400">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="font-display text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* Toolbar row for filters/search above tables. */
export function Toolbar({ children, className }) {
  return <div className={cn('mb-4 flex flex-wrap items-center gap-2', className)}>{children}</div>;
}

/* A simple labelled field for read-only detail panels. */
export function Field({ label, children, className }) {
  return (
    <div className={cn('space-y-1', className)}>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800 dark:text-slate-100">{children ?? '—'}</dd>
    </div>
  );
}

/* Full-page centered spinner. */
export function PageLoader({ label = 'Cargando…' }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
      <Loader2 className="h-7 w-7 animate-spin text-violet-400" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
