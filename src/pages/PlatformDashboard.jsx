import React from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Building2,
  Sparkles,
  Clock,
  ShieldAlert,
  DollarSign,
  LifeBuoy,
  TrendingUp,
  ArrowRight,
  Activity,
  CalendarClock,
  Layers,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { format, formatDistanceToNow, subMonths, startOfMonth } from 'date-fns';
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
import { useRequirePage } from '@/lib/useCurrentUser';
import { getPlan, formatMoney, PLAN_ORDER, LICENSE_PLANS } from '@/lib/licensePlans';
import { daysUntil } from '@/lib/useTenant';

const EVENT_LABELS = {
  trial_started: 'Prueba iniciada',
  trial_extended: 'Prueba extendida',
  plan_changed: 'Cambio de plan',
  license_activated: 'Licencia activada',
  license_renewed: 'Licencia renovada',
  license_expired: 'Licencia vencida',
  view_only: 'Solo lectura',
  suspended: 'Suspendido',
  reactivated: 'Reactivado',
  archived: 'Archivado',
};

function monthlyRevenue(business) {
  if (business.billing_status !== 'active') return 0;
  const plan = getPlan(business.license_plan);
  if (business.license_cycle === 'annual') {
    return (plan.annual_price_mxn || 0) / 12;
  }
  return plan.monthly_price_mxn || 0;
}

export default function PlatformDashboard() {
  const { ready } = useRequirePage('PlatformDashboard');

  const { data: businesses, isLoading: loadingBiz } = useQuery({
    queryKey: ['platform', 'businesses'],
    queryFn: () => base44.entities.Business.list('-created_date', 500),
    enabled: ready,
  });

  const { data: tickets, isLoading: loadingTickets } = useQuery({
    queryKey: ['platform', 'tickets'],
    queryFn: () => base44.entities.SupportTicket.list('-created_date', 500),
    enabled: ready,
  });

  const { data: events, isLoading: loadingEvents } = useQuery({
    queryKey: ['platform', 'license-events'],
    queryFn: () => base44.entities.LicenseEvent.list('-created_date', 50),
    enabled: ready,
  });

  const biz = businesses || [];
  const tk = tickets || [];

  const kpis = React.useMemo(() => {
    const total = biz.length;
    const activos = biz.filter((b) => b.billing_status === 'active').length;
    const enPrueba = biz.filter((b) => b.billing_status === 'trial').length;
    const porVencer = biz.filter((b) => {
      const d = daysUntil(b.trial_end_at);
      return b.billing_status === 'trial' && d !== null && d >= 0 && d <= 7;
    }).length;
    const enRiesgo = biz.filter(
      (b) => b.billing_status === 'suspended' || b.billing_status === 'view_only',
    ).length;
    const mrr = biz.reduce((sum, b) => sum + monthlyRevenue(b), 0);
    const ticketsAbiertos = tk.filter(
      (t) => t.status === 'open' || t.status === 'in_progress',
    ).length;
    return { total, activos, enPrueba, porVencer, enRiesgo, mrr, ticketsAbiertos };
  }, [biz, tk]);

  const altaPorMes = React.useMemo(() => {
    const buckets = [];
    for (let i = 5; i >= 0; i--) {
      const d = startOfMonth(subMonths(new Date(), i));
      buckets.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM', { locale: es }), value: 0, date: d });
    }
    biz.forEach((b) => {
      if (!b.created_date) return;
      const key = format(new Date(b.created_date), 'yyyy-MM');
      const bucket = buckets.find((x) => x.key === key);
      if (bucket) bucket.value += 1;
    });
    return buckets;
  }, [biz]);

  const planData = React.useMemo(() => {
    return PLAN_ORDER.map((key) => ({
      name: LICENSE_PLANS[key].name,
      value: biz.filter((b) => (b.license_plan || 'starter') === key).length,
      color: LICENSE_PLANS[key].accent,
    })).filter((p) => p.value > 0);
  }, [biz]);

  const atencion = React.useMemo(() => {
    const trialsExpirando = biz
      .filter((b) => {
        const d = daysUntil(b.trial_end_at);
        return b.billing_status === 'trial' && d !== null && d <= 7;
      })
      .map((b) => ({
        id: b.id,
        type: 'trial',
        title: b.name || 'Negocio sin nombre',
        detail:
          daysUntil(b.trial_end_at) < 0
            ? 'Prueba vencida'
            : `Prueba termina en ${daysUntil(b.trial_end_at)} día(s)`,
        to: 'PlatformTenants',
        tone: daysUntil(b.trial_end_at) < 0 ? 'urgent' : 'high',
      }));
    const suspendidos = biz
      .filter((b) => b.billing_status === 'suspended' || b.billing_status === 'view_only')
      .map((b) => ({
        id: b.id,
        type: 'risk',
        title: b.name || 'Negocio sin nombre',
        detail: b.billing_status === 'suspended' ? 'Suspendido' : 'Solo lectura',
        to: 'PlatformTenants',
        tone: b.billing_status === 'suspended' ? 'urgent' : 'high',
      }));
    const ticketsUrgentes = tk
      .filter(
        (t) =>
          (t.status === 'open' || t.status === 'in_progress') && t.priority === 'urgent',
      )
      .map((t) => ({
        id: t.id,
        type: 'ticket',
        title: t.subject || 'Ticket sin asunto',
        detail: `${t.business_name || 'Negocio'} · urgente`,
        to: 'PlatformSupport',
        tone: 'urgent',
      }));
    return [...ticketsUrgentes, ...trialsExpirando, ...suspendidos].slice(0, 8);
  }, [biz, tk]);

  if (!ready) return <PageLoader />;

  const loadingAll = loadingBiz || loadingTickets;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Consola ACACIA"
        title="Sala de control"
        description="Estado general de la plataforma Puntos+: negocios, licencias y soporte en un solo lugar."
        icon={Activity}
        accent="violet"
        actions={
          <>
            <Link to={createPageUrl('PlatformTenants')}>
              <Button variant="outline" size="sm">
                <Building2 className="h-4 w-4 mr-1.5" /> Negocios
              </Button>
            </Link>
            <Link to={createPageUrl('PlatformSupport')}>
              <Button size="sm" className="bg-violet-600 hover:bg-violet-700">
                <LifeBuoy className="h-4 w-4 mr-1.5" /> Soporte
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile label="Negocios" value={kpis.total} icon={Building2} tone="violet" loading={loadingBiz} sublabel="Total registrados" />
        <StatTile label="Activos" value={kpis.activos} icon={Sparkles} tone="emerald" loading={loadingBiz} sublabel="Con licencia vigente" />
        <StatTile label="En prueba" value={kpis.enPrueba} icon={Clock} tone="sky" loading={loadingBiz} sublabel={`${kpis.porVencer} por vencer (7d)`} />
        <StatTile label="En riesgo" value={kpis.enRiesgo} icon={ShieldAlert} tone="rose" loading={loadingBiz} sublabel="Suspendidos / solo lectura" />
        <StatTile label="MRR estimado" value={formatMoney(Math.round(kpis.mrr))} icon={DollarSign} tone="gold" loading={loadingBiz} sublabel="Ingreso mensual recurrente" />
        <StatTile label="Tickets abiertos" value={kpis.ticketsAbiertos} icon={LifeBuoy} tone="pink" loading={loadingTickets} sublabel="Requieren respuesta" />
        <StatTile label="Por vencer" value={kpis.porVencer} icon={CalendarClock} tone="slate" loading={loadingBiz} sublabel="Pruebas (7 días)" />
        <StatTile label="ARR estimado" value={formatMoney(Math.round(kpis.mrr * 12))} icon={TrendingUp} tone="violet" loading={loadingBiz} sublabel="Proyección anual" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <SectionCard
          title="Altas de negocios"
          description="Nuevos negocios por mes (últimos 6)"
          icon={TrendingUp}
          className="lg:col-span-2"
        >
          {loadingAll ? (
            <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={altaPorMes}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  />
                  <Bar dataKey="value" name="Altas" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Negocios por plan" description="Distribución de la cartera" icon={Layers}>
          {loadingAll ? (
            <div className="h-48 animate-pulse rounded-xl bg-slate-100" />
          ) : planData.length === 0 ? (
            <EmptyState icon={Layers} title="Sin datos" description="Aún no hay negocios para graficar." />
          ) : (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={planData} cx="50%" cy="50%" innerRadius={42} outerRadius={70} paddingAngle={2} dataKey="value">
                      {planData.map((entry, i) => (
                        <Cell key={`cell-${i}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {planData.map((p) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-xs text-slate-600">
                      {p.name}: <span className="tnum font-medium">{p.value}</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Atención requerida"
          description="Pruebas por vencer, cuentas en riesgo y tickets urgentes"
          icon={ShieldAlert}
          bodyClassName="p-0"
        >
          {loadingAll ? (
            <div className="p-5 space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : atencion.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Sparkles} title="Todo en orden" description="No hay pendientes que requieran tu atención ahora mismo." />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {atencion.map((a) => (
                <li key={`${a.type}-${a.id}`}>
                  <Link
                    to={createPageUrl(a.to)}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{a.title}</p>
                      <p className="text-xs text-slate-500 truncate">{a.detail}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusPill status={a.tone} label={a.tone === 'urgent' ? 'Urgente' : 'Atención'} />
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Actividad de licencias"
          description="Eventos recientes de la cartera"
          icon={Activity}
          bodyClassName="p-0"
        >
          {loadingEvents ? (
            <div className="p-5 space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : !events || events.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={Activity} title="Sin movimientos" description="Aún no se han registrado eventos de licencia." />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {events.map((e) => (
                <motion.li
                  key={e.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-start gap-3 px-5 py-3"
                >
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-500">
                    <Activity className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800">
                      <span className="font-medium">{EVENT_LABELS[e.event_type] || e.event_type}</span>
                      {e.business_name ? ` · ${e.business_name}` : ''}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {e.to_plan && <PlanBadge plan={e.to_plan} className="mr-1" />}
                      {e.amount_mxn ? `${formatMoney(e.amount_mxn)} · ` : ''}
                      {e.created_date
                        ? formatDistanceToNow(new Date(e.created_date), { addSuffix: true, locale: es })
                        : ''}
                    </p>
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </PageShell>
  );
}
