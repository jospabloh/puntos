import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2,
  Plus,
  Search,
  CheckCircle2,
  Eye,
  PauseCircle,
  PlayCircle,
  Archive,
  Save,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  PageShell,
  PageHeader,
  SectionCard,
  StatusPill,
  PlanBadge,
  EmptyState,
  Toolbar,
  Field,
  PageLoader,
} from '@/components/backoffice/Kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { useRequirePage } from '@/lib/useCurrentUser';
import { PLAN_ORDER, getPlan, formatLimit } from '@/lib/licensePlans';
import { setActiveBusiness } from '@/lib/activeTenant';
import { createPageUrl } from '@/utils';

const DAY_MS = 864e5;
const now = () => new Date().toISOString();
const plus = (days) => new Date(Date.now() + days * DAY_MS).toISOString();

function randomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

// Lifecycle actions that interrupt or limit a tenant's access require a
// confirmation step before they run.
const CONFIRM_ACTIONS = {
  view_only: {
    title: '¿Poner en solo lectura?',
    description:
      'El negocio podrá consultar sus datos pero no registrar operaciones en el punto de venta. Puedes reactivarlo después.',
    confirmLabel: 'Solo lectura',
  },
  suspend: {
    title: '¿Suspender este negocio?',
    description:
      'Se suspenderá el acceso del negocio a la plataforma. Nadie de su equipo podrá iniciar sesión hasta reactivarlo.',
    confirmLabel: 'Suspender',
  },
  archive: {
    title: '¿Archivar este negocio?',
    description:
      'El negocio quedará archivado y fuera de operación. Esta es una acción de cierre de cuenta; podrás reactivarlo desde soporte.',
    confirmLabel: 'Archivar',
  },
};

const STATUS_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'trial', label: 'En prueba' },
  { key: 'active', label: 'Activos' },
  { key: 'view_only', label: 'Solo lectura' },
  { key: 'suspended', label: 'Suspendidos' },
  { key: 'archived', label: 'Archivados' },
];

function fmtDate(d) {
  if (!d) return '—';
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: es });
  } catch {
    return '—';
  }
}

const EMPTY_FORM = {
  license_plan: 'starter',
  license_cycle: 'monthly',
  billing_status: 'trial',
  licensed_user_limit: '',
  licensed_store_limit: '',
  license_expires_at: '',
  payment_reference: '',
  activation_notes: '',
  auto_renewal: false,
};

function toDateInput(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

export default function PlatformTenants() {
  const { user, ready } = useRequirePage('PlatformTenants');
  const qc = useQueryClient();

  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [planFilter, setPlanFilter] = React.useState('all');
  const [selected, setSelected] = React.useState(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newBiz, setNewBiz] = React.useState({ name: '', owner_email: '', license_plan: 'starter' });
  const [confirm, setConfirm] = React.useState(null); // pending destructive action key

  const { data: businesses, isLoading } = useQuery({
    queryKey: ['platform', 'businesses'],
    queryFn: () => base44.entities.Business.list('-created_date', 500),
    enabled: ready,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['platform'] });

  const logEvent = (payload) => base44.entities.LicenseEvent.create({ actor_email: user?.email, effective_at: now(), ...payload });

  const openDetail = (b) => {
    setSelected(b);
    setForm({
      license_plan: b.license_plan || 'starter',
      license_cycle: b.license_cycle || 'monthly',
      billing_status: b.billing_status || 'trial',
      licensed_user_limit: b.licensed_user_limit ?? '',
      licensed_store_limit: b.licensed_store_limit ?? '',
      license_expires_at: toDateInput(b.license_expires_at),
      payment_reference: b.payment_reference || '',
      activation_notes: b.activation_notes || '',
      auto_renewal: Boolean(b.auto_renewal),
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const patch = {
        license_plan: form.license_plan,
        license_cycle: form.license_cycle,
        billing_status: form.billing_status,
        licensed_user_limit: form.licensed_user_limit === '' ? null : Number(form.licensed_user_limit),
        licensed_store_limit: form.licensed_store_limit === '' ? null : Number(form.licensed_store_limit),
        license_expires_at: form.license_expires_at ? new Date(form.license_expires_at).toISOString() : null,
        payment_reference: form.payment_reference,
        activation_notes: form.activation_notes,
        auto_renewal: form.auto_renewal,
      };
      await base44.entities.Business.update(selected.id, patch);
      if (form.license_plan !== selected.license_plan) {
        await logEvent({
          business_id: selected.id,
          business_name: selected.name,
          event_type: 'plan_changed',
          from_plan: selected.license_plan,
          to_plan: form.license_plan,
          notes: 'Cambio de plan desde consola',
        });
      }
      return patch;
    },
    onSuccess: (patch) => {
      toast.success('Negocio actualizado');
      setSelected((s) => (s ? { ...s, ...patch } : s));
      invalidate();
    },
    onError: () => toast.error('No se pudo guardar'),
  });

  const lifecycleMutation = useMutation({
    mutationFn: async ({ action }) => {
      const b = selected;
      let patch = {};
      let event = {};
      if (action === 'activate') {
        const expires = form.license_cycle === 'annual' ? plus(365) : plus(30);
        patch = {
          billing_status: 'active',
          status: 'active',
          license_activated_at: now(),
          license_expires_at: expires,
          activated_by_admin: user?.email,
        };
        event = { event_type: 'license_activated', to_status: 'active', expires_at: expires, to_plan: form.license_plan };
      } else if (action === 'view_only') {
        patch = { billing_status: 'view_only' };
        event = { event_type: 'view_only', to_status: 'view_only' };
      } else if (action === 'suspend') {
        patch = { billing_status: 'suspended', status: 'suspended' };
        event = { event_type: 'suspended', to_status: 'suspended' };
      } else if (action === 'reactivate') {
        patch = { billing_status: 'active', status: 'active' };
        event = { event_type: 'reactivated', to_status: 'active' };
      } else if (action === 'archive') {
        patch = { billing_status: 'archived', status: 'suspended' };
        event = { event_type: 'archived', to_status: 'archived' };
      }
      await base44.entities.Business.update(b.id, patch);
      await logEvent({
        business_id: b.id,
        business_name: b.name,
        from_status: b.billing_status,
        ...event,
      });
      return patch;
    },
    onSuccess: (patch) => {
      toast.success('Acción aplicada');
      setSelected((s) => (s ? { ...s, ...patch } : s));
      setForm((f) => ({ ...f, billing_status: patch.billing_status ?? f.billing_status }));
      invalidate();
    },
    onError: () => toast.error('No se pudo aplicar la acción'),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const created = await base44.entities.Business.create({
        name: newBiz.name.trim(),
        owner_email: newBiz.owner_email.trim(),
        contact_email: newBiz.owner_email.trim(),
        license_plan: newBiz.license_plan,
        license_cycle: 'monthly',
        billing_status: 'trial',
        status: 'active',
        trial_start_at: now(),
        trial_end_at: plus(30),
        invite_code: randomCode(),
      });
      await logEvent({
        business_id: created.id,
        business_name: created.name,
        event_type: 'trial_started',
        to_status: 'trial',
        to_plan: newBiz.license_plan,
        expires_at: created.trial_end_at,
        notes: 'Alta desde consola (prueba 30 días)',
      });
      return created;
    },
    onSuccess: () => {
      toast.success('Negocio creado en prueba de 30 días');
      setCreateOpen(false);
      setNewBiz({ name: '', owner_email: '', license_plan: 'starter' });
      invalidate();
    },
    onError: () => toast.error('No se pudo crear el negocio'),
  });

  const filtered = React.useMemo(() => {
    let list = businesses || [];
    if (statusFilter !== 'all') list = list.filter((b) => (b.billing_status || 'trial') === statusFilter);
    if (planFilter !== 'all') list = list.filter((b) => (b.license_plan || 'starter') === planFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (b) =>
          (b.name || '').toLowerCase().includes(q) ||
          (b.owner_email || '').toLowerCase().includes(q) ||
          (b.contact_email || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [businesses, statusFilter, planFilter, search]);

  if (!ready) return <PageLoader />;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const busy = saveMutation.isPending || lifecycleMutation.isPending;

  // Destructive actions are confirmed first; others run immediately.
  const runLifecycle = (action) => {
    if (CONFIRM_ACTIONS[action]) {
      setConfirm(action);
    } else {
      lifecycleMutation.mutate({ action });
    }
  };
  const confirmCopy = confirm ? CONFIRM_ACTIONS[confirm] : null;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Consola ACACIA"
        title="Negocios"
        description="Gestiona los negocios de la plataforma, sus licencias y su ciclo de vida."
        icon={Building2}
        accent="violet"
        actions={
          <Button size="sm" className="bg-violet-600 hover:bg-violet-700" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nuevo negocio
          </Button>
        }
      />

      <Toolbar>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o correo…"
            aria-label="Buscar negocios por nombre o correo"
            className="pl-9"
          />
        </div>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los planes</SelectItem>
            {PLAN_ORDER.map((p) => (
              <SelectItem key={p} value={p}>
                {getPlan(p).name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Toolbar>

      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-4">
        <TabsList className="flex-wrap h-auto">
          {STATUS_FILTERS.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <SectionCard bodyClassName="p-0">
        {isLoading ? (
          <div className="p-5 space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Building2}
              title="Sin negocios"
              description="No hay negocios que coincidan con los filtros actuales."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Negocio</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Límites</TableHead>
                  <TableHead>Prueba / Licencia</TableHead>
                  <TableHead>Alta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => (
                  <TableRow key={b.id} className="cursor-pointer" onClick={() => openDetail(b)}>
                    <TableCell>
                      <div className="font-medium text-slate-800 dark:text-slate-100">{b.name || 'Sin nombre'}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{b.owner_email || b.contact_email || '—'}</div>
                    </TableCell>
                    <TableCell>
                      <PlanBadge plan={b.license_plan || 'starter'} />
                    </TableCell>
                    <TableCell>
                      <StatusPill status={b.billing_status || 'trial'} />
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-300 tnum">
                      {formatLimit(b.licensed_user_limit ?? getPlan(b.license_plan).limits.staff_users)} usr ·{' '}
                      {formatLimit(b.licensed_store_limit ?? getPlan(b.license_plan).limits.stores)} tnd
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                      {b.billing_status === 'trial' ? fmtDate(b.trial_end_at) : fmtDate(b.license_expires_at)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 dark:text-slate-400">{fmtDate(b.created_date)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selected.name || 'Negocio'}
                  <StatusPill status={form.billing_status} />
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-4 mb-2">
                <Field label="Dueño">{selected.owner_email || '—'}</Field>
                <Field label="Código de invitación">{selected.invite_code || '—'}</Field>
              </div>
              <Separator className="my-2" />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Plan</Label>
                  <Select value={form.license_plan} onValueChange={(v) => set('license_plan', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAN_ORDER.map((p) => (
                        <SelectItem key={p} value={p}>
                          {getPlan(p).name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ciclo</Label>
                  <Select value={form.license_cycle} onValueChange={(v) => set('license_cycle', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensual</SelectItem>
                      <SelectItem value="annual">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Estado de facturación</Label>
                  <Select value={form.billing_status} onValueChange={(v) => set('billing_status', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">Prueba</SelectItem>
                      <SelectItem value="active">Activo</SelectItem>
                      <SelectItem value="view_only">Solo lectura</SelectItem>
                      <SelectItem value="suspended">Suspendido</SelectItem>
                      <SelectItem value="archived">Archivado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Vence licencia</Label>
                  <Input type="date" value={form.license_expires_at} onChange={(e) => set('license_expires_at', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Límite de usuarios</Label>
                  <Input type="number" min="0" value={form.licensed_user_limit} onChange={(e) => set('licensed_user_limit', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Límite de tiendas</Label>
                  <Input type="number" min="0" value={form.licensed_store_limit} onChange={(e) => set('licensed_store_limit', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Referencia de pago</Label>
                  <Input value={form.payment_reference} onChange={(e) => set('payment_reference', e.target.value)} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <Label className="cursor-pointer">Renovación automática</Label>
                  <Switch checked={form.auto_renewal} onCheckedChange={(v) => set('auto_renewal', v)} />
                </div>
              </div>

              <div className="space-y-1.5 mt-3">
                <Label>Notas de activación</Label>
                <Textarea rows={2} value={form.activation_notes} onChange={(e) => set('activation_notes', e.target.value)} />
              </div>

              <Separator className="my-3" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => runLifecycle('activate')}>
                  <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-600" /> Activar licencia
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => runLifecycle('view_only')}>
                  <Eye className="h-4 w-4 mr-1.5 text-amber-600" /> Solo lectura
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => runLifecycle('suspend')}>
                  <PauseCircle className="h-4 w-4 mr-1.5 text-rose-600" /> Suspender
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => runLifecycle('reactivate')}>
                  <PlayCircle className="h-4 w-4 mr-1.5 text-emerald-600" /> Reactivar
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => runLifecycle('archive')}>
                  <Archive className="h-4 w-4 mr-1.5 text-slate-500 dark:text-slate-400" /> Archivar
                </Button>
              </div>

              <DialogFooter className="mt-4 sm:justify-between">
                <Button variant="outline" onClick={() => { setActiveBusiness(selected.id, selected.name); window.location.href = createPageUrl('AdminDashboard'); }}>
                  <Building2 className="h-4 w-4 mr-1.5" /> Administrar este negocio
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setSelected(null)}>Cerrar</Button>
                  <Button className="bg-violet-600 hover:bg-violet-700" disabled={busy} onClick={() => saveMutation.mutate()}>
                    <Save className="h-4 w-4 mr-1.5" /> Guardar
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo negocio</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre del negocio</Label>
              <Input value={newBiz.name} onChange={(e) => setNewBiz((n) => ({ ...n, name: e.target.value }))} placeholder="Café del Centro" />
            </div>
            <div className="space-y-1.5">
              <Label>Correo del dueño</Label>
              <Input type="email" value={newBiz.owner_email} onChange={(e) => setNewBiz((n) => ({ ...n, owner_email: e.target.value }))} placeholder="dueno@negocio.mx" />
            </div>
            <div className="space-y-1.5">
              <Label>Plan inicial</Label>
              <Select value={newBiz.license_plan} onValueChange={(v) => setNewBiz((n) => ({ ...n, license_plan: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_ORDER.map((p) => (
                    <SelectItem key={p} value={p}>
                      {getPlan(p).name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Se crea con una prueba gratuita de 30 días y un código de invitación.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-violet-600 hover:bg-violet-700"
              disabled={createMutation.isPending || !newBiz.name.trim() || !newBiz.owner_email.trim()}
              onClick={() => createMutation.mutate()}
            >
              Crear negocio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation for destructive lifecycle actions */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmCopy?.title || '¿Confirmar acción?'}</AlertDialogTitle>
            <AlertDialogDescription>{confirmCopy?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              disabled={busy}
              onClick={() => {
                const action = confirm;
                setConfirm(null);
                if (action) lifecycleMutation.mutate({ action });
              }}
            >
              {confirmCopy?.confirmLabel || 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
