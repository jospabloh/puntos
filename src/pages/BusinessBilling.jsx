import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  CreditCard,
  ShieldAlert,
  CalendarClock,
  Store as StoreIcon,
  Users,
  UserCircle,
  Check,
  ArrowUpRight,
  History as HistoryIcon,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  PageShell,
  PageHeader,
  SectionCard,
  StatusPill,
  PlanBadge,
  Field,
  EmptyState,
  PageLoader,
} from '@/components/backoffice/Kit';
import { useRequirePage } from '@/lib/useCurrentUser';
import { useTenant, daysUntil } from '@/lib/useTenant';
import {
  LICENSE_PLANS,
  PLAN_ORDER,
  getPlan,
  formatMoney,
  formatLimit,
  checkLimit,
  LIMIT_LABELS,
  FEATURE_LABELS,
} from '@/lib/licensePlans';

const BANNER_TONES = {
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  critical: 'border-rose-200 bg-rose-50 text-rose-800',
};

const USAGE_META = [
  { key: 'stores', icon: StoreIcon },
  { key: 'staff_users', icon: Users },
  { key: 'customers', icon: UserCircle },
];

function fmtDate(d) {
  if (!d) return '—';
  try {
    return format(new Date(d), "d 'de' MMM yyyy", { locale: es });
  } catch {
    return '—';
  }
}

function daysLabel(d) {
  const n = daysUntil(d);
  if (n === null) return '';
  if (n < 0) return `vencido hace ${Math.abs(n)} día${Math.abs(n) === 1 ? '' : 's'}`;
  return `en ${n} día${n === 1 ? '' : 's'}`;
}

export default function BusinessBilling() {
  const { user, ready } = useRequirePage('BusinessBilling');
  const { business, license, isLoading: tenantLoading, refetch } = useTenant(user);
  const queryClient = useQueryClient();
  const businessId = user?.business_id;

  const [requestPlan, setRequestPlan] = useState(null);
  const [requestNote, setRequestNote] = useState('');

  const storesQuery = useQuery({
    queryKey: ['bill-stores', businessId],
    enabled: !!businessId && ready,
    queryFn: () => base44.entities.Store.filter({ business_id: businessId }, '-created_date', 500),
  });
  const usersQuery = useQuery({
    queryKey: ['bill-users', businessId],
    enabled: !!businessId && ready,
    queryFn: () => base44.entities.User.filter({ business_id: businessId }),
  });
  const customersQuery = useQuery({
    queryKey: ['bill-customers', businessId],
    enabled: !!businessId && ready,
    queryFn: () => base44.entities.LoyaltyAccount.filter({ business_id: businessId }, '-created_date', 500),
  });
  const eventsQuery = useQuery({
    queryKey: ['bill-events', businessId],
    enabled: !!businessId && ready,
    queryFn: () => base44.entities.LicenseEvent.filter({ business_id: businessId }, '-created_date', 200),
  });

  const requestMutation = useMutation({
    mutationFn: async (plan) => {
      const now = new Date().toISOString();
      const ticket = await base44.entities.SupportTicket.create({
        business_id: businessId,
        business_name: user?.business_name || business?.name || '',
        subject: `Solicitud de cambio a plan ${plan.name}`,
        description: requestNote || `Solicito cambiar mi licencia al plan ${plan.name}.`,
        category: 'billing',
        priority: 'normal',
        status: 'open',
        created_by_email: user?.email,
        unread_for_owner: true,
        last_message_at: now,
      });
      // Push en tiempo real a ACACIA Mission Control (no bloquea la UI).
      base44.functions.invoke('notifyTicketCreated', { ticketId: ticket.id }).catch(() => {});
      await base44.entities.Business.update(business.id, { support_contacted_at: now });
    },
    onSuccess: async () => {
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['bill-events', businessId] });
      setRequestPlan(null);
      setRequestNote('');
      toast.success('Solicitud enviada a soporte');
    },
    onError: () => toast.error('No se pudo enviar la solicitud'),
  });

  if (!ready) return <PageLoader />;
  if (tenantLoading || !business) return <PageLoader label="Cargando licencia…" />;

  const planKey = business.license_plan;
  const plan = getPlan(planKey);
  const banner = license?.banner;

  const usedMap = {
    stores: (storesQuery.data || []).length,
    staff_users: (usersQuery.data || []).length,
    customers: (customersQuery.data || []).length,
  };

  const events = eventsQuery.data || [];

  return (
    <PageShell>
      <PageHeader
        eyebrow="Mi negocio"
        title="Licencia y plan"
        description="Consulta tu plan, tu consumo y solicita cambios cuando lo necesites."
        icon={CreditCard}
        actions={<StatusPill status={business.billing_status} />}
      />

      {banner && (
        <div className={`mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3 ${BANNER_TONES[banner.tone] || BANNER_TONES.info}`}>
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">{banner.title}</p>
            <p className="text-sm opacity-90">{banner.message}</p>
          </div>
        </div>
      )}

      {/* Hero plan card */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-violet-600 to-fuchsia-600 p-6 text-white shadow-lg shadow-violet-500/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Plan actual</span>
            </div>
            <h2 className="mt-1 font-display text-3xl font-bold">{plan.name}</h2>
            <p className="mt-1 max-w-md text-sm text-white/80">{plan.tagline}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-3xl font-bold tnum">{formatMoney(plan.monthly_price_mxn)}</p>
            {plan.monthly_price_mxn ? <p className="text-xs text-white/70">/ mes</p> : null}
            <div className="mt-2 flex justify-end"><PlanBadge plan={planKey} /></div>
          </div>
        </div>
      </div>

      {/* Key dates */}
      <SectionCard title="Fechas clave" description="Vigencia de tu prueba y licencia." icon={CalendarClock} className="mb-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Fin de prueba">
            {business.trial_end_at ? (
              <span>{fmtDate(business.trial_end_at)} <span className="text-xs text-slate-400">({daysLabel(business.trial_end_at)})</span></span>
            ) : '—'}
          </Field>
          <Field label="Vencimiento de licencia">
            {business.license_expires_at ? (
              <span>{fmtDate(business.license_expires_at)} <span className="text-xs text-slate-400">({daysLabel(business.license_expires_at)})</span></span>
            ) : '—'}
          </Field>
          <Field label="Ciclo de facturación">{business.license_cycle || 'Mensual'}</Field>
          <Field label="Estado">{<StatusPill status={business.billing_status} />}</Field>
        </div>
      </SectionCard>

      {/* Usage */}
      <SectionCard title="Uso del plan" description="Consumo actual frente a los límites de tu plan." icon={StoreIcon} className="mb-6">
        <div className="grid gap-6">
          {USAGE_META.map(({ key, icon: Icon }) => {
            const used = usedMap[key];
            const c = checkLimit(planKey, key, used);
            const pct = c.unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, c.limit)) * 100));
            return (
              <div key={key}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-700"><Icon className="h-4 w-4 text-violet-500" />{LIMIT_LABELS[key]}</span>
                  <span className="text-sm text-slate-600 tnum">{used.toLocaleString('es-MX')} / {formatLimit(c.limit)}</span>
                </div>
                {c.unlimited ? (
                  <div className="h-2.5 w-full rounded-full bg-emerald-100"><div className="h-2.5 rounded-full bg-emerald-400" style={{ width: '100%' }} /></div>
                ) : (
                  <Progress value={pct} className="h-2.5" />
                )}
                {!c.unlimited && !c.allowed && (
                  <p className="mt-1 text-xs text-rose-500">Alcanzaste el límite de tu plan.</p>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Plans comparison */}
      <SectionCard title="Planes disponibles" description="Compara y solicita un cambio cuando lo necesites." icon={Sparkles} className="mb-6" bodyClassName="p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLAN_ORDER.map((key) => {
            const p = LICENSE_PLANS[key];
            const isCurrent = key === planKey;
            return (
              <div
                key={key}
                className={`flex flex-col rounded-2xl border p-5 transition ${isCurrent ? 'border-violet-400 ring-2 ring-violet-200 bg-violet-50/40' : 'border-slate-200 bg-white hover:border-violet-200'}`}
              >
                <div className="flex items-center justify-between">
                  <PlanBadge plan={key} />
                  {isCurrent && <span className="text-xs font-semibold text-violet-600">Actual</span>}
                  {p.popular && !isCurrent && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Popular</span>}
                </div>
                <h3 className="mt-3 font-display text-lg font-bold text-slate-900">{p.name}</h3>
                <p className="mt-1 text-xs text-slate-500">{p.tagline}</p>
                <p className="mt-3 font-display text-2xl font-bold text-slate-900 tnum">{formatMoney(p.monthly_price_mxn)}</p>
                {p.monthly_price_mxn ? <p className="text-xs text-slate-400">/ mes</p> : null}
                <ul className="mt-4 flex-1 space-y-1.5">
                  {Object.entries(p.features).filter(([, v]) => v).slice(0, 6).map(([f]) => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-slate-600">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />{FEATURE_LABELS[f] || f}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={isCurrent ? 'outline' : 'default'}
                  disabled={isCurrent}
                  onClick={() => { setRequestPlan(p); setRequestNote(`Solicito cambiar mi licencia al plan ${p.name}.`); }}
                  className={isCurrent ? 'mt-4' : 'mt-4 bg-violet-600 hover:bg-violet-700'}
                >
                  {isCurrent ? 'Tu plan actual' : <><ArrowUpRight className="mr-1.5 h-4 w-4" />Solicitar cambio</>}
                </Button>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* License history */}
      <SectionCard title="Historial de licencia" description="Cambios de plan, estado y cobros." icon={HistoryIcon}>
        {eventsQuery.isLoading ? (
          <PageLoader label="Cargando historial…" />
        ) : events.length === 0 ? (
          <EmptyState icon={HistoryIcon} title="Sin movimientos" description="Aquí verás los cambios de tu licencia." />
        ) : (
          <ol className="relative space-y-5 border-l border-slate-200 pl-5">
            {events.map((ev) => (
              <li key={ev.id} className="relative">
                <span className="absolute -left-[1.45rem] top-1 h-2.5 w-2.5 rounded-full bg-violet-400 ring-4 ring-violet-100" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">{(ev.event_type || 'Evento').replace(/_/g, ' ')}</p>
                  <span className="text-xs text-slate-400">{fmtDate(ev.effective_at || ev.created_date)}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {ev.from_plan && ev.to_plan ? `Plan: ${ev.from_plan} → ${ev.to_plan}. ` : ''}
                  {ev.from_status && ev.to_status ? `Estado: ${ev.from_status} → ${ev.to_status}. ` : ''}
                  {ev.amount_mxn ? `${formatMoney(ev.amount_mxn)}. ` : ''}
                  {ev.notes || ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>

      {/* Request change dialog */}
      <Dialog open={!!requestPlan} onOpenChange={(o) => !o && setRequestPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar cambio a {requestPlan?.name}</DialogTitle>
            <DialogDescription>
              Enviaremos tu solicitud a soporte de Puntos+. Te contactaremos para coordinar el cambio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="req-note">Mensaje (opcional)</Label>
            <Textarea id="req-note" rows={4} value={requestNote} onChange={(e) => setRequestNote(e.target.value)} placeholder="Cuéntanos por qué quieres cambiar de plan…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestPlan(null)}>Cancelar</Button>
            <Button onClick={() => requestPlan && requestMutation.mutate(requestPlan)} disabled={requestMutation.isPending} className="bg-violet-600 hover:bg-violet-700">
              {requestMutation.isPending ? 'Enviando…' : 'Enviar solicitud'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
