import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  KeyRound,
  Check,
  Star,
  Clock,
  Sparkles,
  AlertTriangle,
  Ban,
  RefreshCw,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  PageShell,
  PageHeader,
  StatTile,
  SectionCard,
  StatusPill,
  PlanBadge,
  EmptyState,
  PageLoader,
} from '@/components/backoffice/Kit';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useRequirePage } from '@/lib/useCurrentUser';
import {
  LICENSE_PLANS,
  PLAN_ORDER,
  getPlan,
  formatMoney,
  formatLimit,
  FEATURE_LABELS,
  LIMIT_LABELS,
} from '@/lib/licensePlans';
import { daysUntil } from '@/lib/useTenant';

const DAY_MS = 864e5;
const now = () => new Date().toISOString();
const plus = (days) => new Date(Date.now() + days * DAY_MS).toISOString();

function fmtDate(d) {
  if (!d) return '—';
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: es });
  } catch {
    return '—';
  }
}

function monthlyRevenue(business) {
  if (business.billing_status !== 'active') return 0;
  const plan = getPlan(business.license_plan);
  if (business.license_cycle === 'annual') return (plan.annual_price_mxn || 0) / 12;
  return plan.monthly_price_mxn || 0;
}

/* Hoisted to module scope: defining these inside the page component re-creates
   them on every render, remounting rows and resetting any focus/state. */
function LicenseRow({ b, action, busy, onAction }) {
  const isTrial = (b.billing_status || 'trial') === 'trial';
  const dateLabel = isTrial
    ? `Prueba: ${fmtDate(b.trial_end_at)}`
    : `Licencia: ${fmtDate(b.license_expires_at)}`;
  const days = isTrial ? daysUntil(b.trial_end_at) : daysUntil(b.license_expires_at);
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-800 truncate">{b.name || 'Sin nombre'}</span>
          <PlanBadge plan={b.license_plan || 'starter'} />
        </div>
        <p className="text-xs text-slate-500 truncate">
          {dateLabel}
          {days !== null && (
            <span className={days < 0 ? 'text-rose-600' : 'text-slate-500'}>
              {' '}· {days < 0 ? `vencida hace ${Math.abs(days)}d` : `${days}d restantes`}
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusPill status={b.billing_status || 'trial'} />
        {action && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onAction({ business: b, activate: action === 'activate' })}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            {action === 'activate' ? 'Activar' : 'Renovar'}
          </Button>
        )}
      </div>
    </div>
  );
}

function Portfolio({ title, icon: Icon, items, action, emptyHint, busy, onAction }) {
  const list = items || [];
  return (
    <SectionCard title={title} icon={Icon} bodyClassName="p-0" description={`${list.length} negocio(s)`}>
      {list.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={Icon} title="Sin negocios" description={emptyHint} />
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {list.map((b) => (
            <LicenseRow key={b.id} b={b} action={action} busy={busy} onAction={onAction} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export default function PlatformLicenses() {
  const { user, ready } = useRequirePage('PlatformLicenses');
  const qc = useQueryClient();

  const { data: businesses, isLoading } = useQuery({
    queryKey: ['platform', 'businesses'],
    queryFn: () => base44.entities.Business.list('-created_date', 500),
    enabled: ready,
  });

  const biz = businesses || [];

  const renewMutation = useMutation({
    mutationFn: async ({ business, activate }) => {
      const expires = plus(365);
      await base44.entities.Business.update(business.id, {
        billing_status: 'active',
        status: 'active',
        license_expires_at: expires,
        license_activated_at: business.license_activated_at || now(),
        activated_by_admin: user?.email,
      });
      await base44.entities.LicenseEvent.create({
        business_id: business.id,
        business_name: business.name,
        event_type: activate ? 'license_activated' : 'license_renewed',
        from_status: business.billing_status,
        to_status: 'active',
        to_plan: business.license_plan,
        expires_at: expires,
        effective_at: now(),
        actor_email: user?.email,
        notes: activate ? 'Activación desde licencias' : 'Renovación +1 año',
      });
    },
    onSuccess: () => {
      toast.success('Licencia actualizada');
      qc.invalidateQueries({ queryKey: ['platform'] });
    },
    onError: () => toast.error('No se pudo actualizar la licencia'),
  });

  const summary = React.useMemo(() => {
    const mensual = biz.reduce((s, b) => s + monthlyRevenue(b), 0);
    const activas = biz.filter((b) => b.billing_status === 'active').length;
    const enPrueba = biz.filter((b) => b.billing_status === 'trial').length;
    return { mensual, anual: mensual * 12, activas, enPrueba };
  }, [biz]);

  const groups = React.useMemo(() => {
    const g = { trial: [], active: [], expiring: [], expired: [], suspended: [] };
    biz.forEach((b) => {
      const st = b.billing_status || 'trial';
      const trialDays = daysUntil(b.trial_end_at);
      const licDays = daysUntil(b.license_expires_at);
      if (st === 'suspended' || st === 'archived') {
        g.suspended.push(b);
      } else if (st === 'view_only' || (st === 'trial' && trialDays !== null && trialDays < 0) || (st === 'active' && licDays !== null && licDays < 0)) {
        g.expired.push(b);
      } else if ((st === 'active' && licDays !== null && licDays <= 14) || (st === 'trial' && trialDays !== null && trialDays <= 14)) {
        g.expiring.push(b);
      } else if (st === 'trial') {
        g.trial.push(b);
      } else if (st === 'active') {
        g.active.push(b);
      }
    });
    return g;
  }, [biz]);

  if (!ready) return <PageLoader />;

  const renewBusy = renewMutation.isPending;
  const onAction = (vars) => renewMutation.mutate(vars);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Consola ACACIA"
        title="Licencias"
        description="Catálogo de planes y estado de la cartera de licencias de la plataforma."
        icon={KeyRound}
        accent="gold"
      />

      {/* Pricing cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {PLAN_ORDER.map((key) => {
          const plan = LICENSE_PLANS[key];
          const activeFeatures = Object.keys(plan.features).filter((f) => plan.features[f]);
          return (
            <Card key={key} className="relative border-slate-200/70 p-5 flex flex-col">
              {plan.popular && (
                <span className="absolute -top-2 right-4 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  <Star className="h-3 w-3" /> Popular
                </span>
              )}
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-slate-900">{plan.name}</h3>
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: plan.accent }} />
              </div>
              <p className="mt-1 text-xs text-slate-500 min-h-[32px]">{plan.tagline}</p>
              <div className="mt-3">
                <span className="font-display text-2xl font-bold text-slate-900 tnum">
                  {formatMoney(plan.monthly_price_mxn)}
                </span>
                {plan.monthly_price_mxn != null && plan.monthly_price_mxn > 0 && (
                  <span className="text-xs text-slate-400"> /mes</span>
                )}
              </div>

              <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
                {Object.keys(LIMIT_LABELS).map((k) => (
                  <div key={k} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{LIMIT_LABELS[k]}</span>
                    <span className="font-medium text-slate-700 tnum">{formatLimit(plan.limits[k])}</span>
                  </div>
                ))}
              </div>

              <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 flex-1">
                {activeFeatures.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-slate-600">
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    {FEATURE_LABELS[f] || f}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile label="Ingreso mensual" value={formatMoney(Math.round(summary.mensual))} icon={DollarSign} tone="gold" loading={isLoading} sublabel="Estimado (activos)" />
        <StatTile label="Ingreso anual" value={formatMoney(Math.round(summary.anual))} icon={TrendingUp} tone="violet" loading={isLoading} sublabel="Proyección" />
        <StatTile label="Licencias activas" value={summary.activas} icon={Sparkles} tone="emerald" loading={isLoading} />
        <StatTile label="En prueba" value={summary.enPrueba} icon={Clock} tone="sky" loading={isLoading} />
      </div>

      <SectionCard title="Cartera de licencias" icon={KeyRound} description="Negocios agrupados por estado de licencia" className="mb-6" bodyClassName="p-5">
        <p className="text-xs text-slate-500">
          Renueva o activa licencias directamente desde cada sección. Cada acción extiende la vigencia 1 año y registra un evento.
        </p>
      </SectionCard>

      {isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Portfolio title="Por vencer" icon={AlertTriangle} items={groups.expiring} action="renew" emptyHint="Nada por vencer en los próximos 14 días." busy={renewBusy} onAction={onAction} />
          <Portfolio title="Vencidas / solo lectura" icon={Ban} items={groups.expired} action="activate" emptyHint="Sin licencias vencidas." busy={renewBusy} onAction={onAction} />
          <Portfolio title="En prueba" icon={Clock} items={groups.trial} action="activate" emptyHint="Sin negocios en prueba." busy={renewBusy} onAction={onAction} />
          <Portfolio title="Activas" icon={Sparkles} items={groups.active} action="renew" emptyHint="Sin licencias activas." busy={renewBusy} onAction={onAction} />
          <Portfolio title="Suspendidas / archivadas" icon={Ban} items={groups.suspended} action="activate" emptyHint="Sin negocios suspendidos." busy={renewBusy} onAction={onAction} />
        </div>
      )}
    </PageShell>
  );
}
