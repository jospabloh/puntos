import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Users,
  UserPlus,
  ShieldAlert,
  Info,
  Store as StoreIcon,
  Mail,
  Clock,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  PageShell,
  PageHeader,
  SectionCard,
  StatTile,
  StatusPill,
  EmptyState,
  PageLoader,
} from '@/components/backoffice/Kit';
import { useRequirePage } from '@/lib/useCurrentUser';
import { useTenant } from '@/lib/useTenant';

const ROLE_DISPLAY = {
  admin: 'Dueño plataforma',
  business_admin: 'Administrador',
  merchant: 'Equipo / Cajero',
  customer: 'Cliente',
  user: 'Cliente',
};

const ROLE_TONE = {
  admin: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  business_admin: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  merchant: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  customer: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-500/20',
  user: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-500/20',
};

const BANNER_TONES = {
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  critical: 'border-rose-200 bg-rose-50 text-rose-800',
};

function initials(name, email) {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function relTime(d) {
  if (!d) return '—';
  try {
    return formatDistanceToNow(new Date(d), { addSuffix: true, locale: es });
  } catch {
    return '—';
  }
}

export default function BusinessUsers() {
  const { user, ready } = useRequirePage('BusinessUsers');
  const { business, license, isLoading: tenantLoading, canWrite } = useTenant(user);
  const queryClient = useQueryClient();
  const businessId = user?.business_id;

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'staff', store_id: '' });
  const [removeTarget, setRemoveTarget] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [copied, setCopied] = useState(false);

  const teamQuery = useQuery({
    queryKey: ['biz-team', businessId],
    enabled: !!businessId && ready,
    queryFn: () => base44.entities.User.filter({ business_id: businessId }),
  });
  const invitesQuery = useQuery({
    queryKey: ['biz-invites', businessId],
    enabled: !!businessId && ready,
    queryFn: () => base44.entities.Invitation.filter({ business_id: businessId, status: 'pending' }, '-created_date', 500),
  });
  const storesQuery = useQuery({
    queryKey: ['biz-stores', businessId],
    enabled: !!businessId && ready,
    queryFn: () => base44.entities.Store.filter({ business_id: businessId }, '-created_date', 500),
  });

  const team = teamQuery.data || [];
  const invites = invitesQuery.data || [];
  const stores = storesQuery.data || [];

  const seatLimit = business?.licensed_user_limit ?? 0;
  const seatsUsed = team.length;
  const atLimit = seatLimit > 0 && seatsUsed >= seatLimit;
  const pct = seatLimit > 0 ? Math.min(100, Math.round((seatsUsed / seatLimit) * 100)) : 0;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['biz-team', businessId] });
    queryClient.invalidateQueries({ queryKey: ['biz-invites', businessId] });
  };

  // Team-member changes go through the manageTeamMember service-role function:
  // it verifies the actor manages the target's tenant and never grants `admin`,
  // so a tenant admin can't escalate themselves or anyone else by writing
  // User.role directly (the User entity locks those fields to service-role writes).
  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role, storeId }) => {
      const res = await base44.functions.invoke('manageTeamMember', { op: 'setRole', userId: id, role, storeId });
      if (!res?.data?.ok) throw new Error(res?.data?.error || 'No se pudo actualizar el rol');
    },
    onSuccess: () => { invalidate(); toast.success('Rol actualizado'); },
    onError: (e) => toast.error(e?.message || 'No se pudo actualizar el rol'),
  });

  const assignStoreMutation = useMutation({
    mutationFn: async ({ id, storeId }) => {
      const res = await base44.functions.invoke('manageTeamMember', { op: 'assignStore', userId: id, storeId });
      if (!res?.data?.ok) throw new Error(res?.data?.error || 'No se pudo asignar la tienda');
    },
    onSuccess: () => { invalidate(); toast.success('Tienda asignada'); },
    onError: (e) => toast.error(e?.message || 'No se pudo asignar la tienda'),
  });

  const removeMutation = useMutation({
    mutationFn: async (id) => {
      const res = await base44.functions.invoke('manageTeamMember', { op: 'remove', userId: id });
      if (!res?.data?.ok) throw new Error(res?.data?.error || 'No se pudo remover al miembro');
    },
    onSuccess: () => { invalidate(); setRemoveTarget(null); toast.success('Miembro removido del equipo'); },
    onError: (e) => toast.error(e?.message || 'No se pudo remover al miembro'),
  });

  const inviteMutation = useMutation({
    mutationFn: (payload) => base44.entities.Invitation.create(payload),
    onSuccess: () => {
      invalidate();
      setInviteOpen(false);
      setInviteForm({ email: '', role: 'staff', store_id: '' });
      toast.success('Invitación creada. Comparte el código de invitación.');
    },
    onError: () => toast.error('No se pudo crear la invitación'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id) => base44.entities.Invitation.update(id, { status: 'revoked' }),
    onSuccess: () => { invalidate(); setRevokeTarget(null); toast.success('Invitación revocada'); },
    onError: () => toast.error('No se pudo revocar la invitación'),
  });

  if (!ready) return <PageLoader />;
  if (tenantLoading) return <PageLoader label="Cargando equipo…" />;

  const handleInvite = () => {
    if (!canWrite || atLimit) return;
    if (!inviteForm.email.trim()) { toast.error('Ingresa un correo'); return; }
    const store = inviteForm.role === 'staff' ? stores.find((s) => s.id === inviteForm.store_id) : null;
    inviteMutation.mutate({
      business_id: businessId,
      business_name: user?.business_name || business?.name || '',
      email: inviteForm.email.trim().toLowerCase(),
      role: inviteForm.role,
      store_id: store?.id || '',
      store_name: store?.name || '',
      status: 'pending',
      invited_by: user?.email,
      expires_at: new Date(Date.now() + 14 * 864e5).toISOString(),
    });
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(business?.invite_code || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const banner = license?.banner;
  const loading = teamQuery.isLoading || storesQuery.isLoading;

  const isSelf = (m) => m.id === user?.id || m.email === user?.email;
  const isOwnerRow = (m) => m.role === 'admin';

  return (
    <PageShell>
      <PageHeader
        eyebrow="Mi negocio"
        title="Equipo y usuarios"
        description="Invita y administra a las personas que operan tu programa de lealtad."
        icon={Users}
        actions={
          <Button
            onClick={() => setInviteOpen(true)}
            disabled={!canWrite || atLimit}
            className="bg-violet-600 hover:bg-violet-700"
          >
            <UserPlus className="mr-2 h-4 w-4" /> Invitar
          </Button>
        }
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

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Asientos usados" value={seatsUsed} icon={Users} tone="violet" loading={loading} sublabel={seatLimit > 0 ? `de ${seatLimit} disponibles` : 'Sin límite definido'} />
        <StatTile label="Invitaciones pendientes" value={invites.length} icon={Mail} tone="gold" loading={invitesQuery.isLoading} />
        <StatTile label="Tiendas" value={stores.length} icon={StoreIcon} tone="sky" loading={storesQuery.isLoading} />
      </div>

      {seatLimit > 0 && (
        <SectionCard title="Uso de asientos" description="Usuarios de equipo según tu licencia." icon={Users} className="mb-6">
          <div className="flex items-center gap-4">
            <Progress value={pct} className="h-2.5" />
            <span className="shrink-0 text-sm font-semibold text-slate-700 dark:text-slate-200 tnum">{seatsUsed} / {seatLimit}</span>
          </div>
          {atLimit && (
            <p className="mt-2 flex items-start gap-2 text-xs text-amber-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Alcanzaste el límite de tu plan. Mejora tu plan o remueve a un miembro para invitar a alguien más.
            </p>
          )}
        </SectionCard>
      )}

      <SectionCard title="Miembros del equipo" description={`${team.length} ${team.length === 1 ? 'persona' : 'personas'}`} icon={Users} bodyClassName="p-0">
        {loading ? (
          <div className="p-5"><PageLoader label="Cargando miembros…" /></div>
        ) : team.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Users} title="Aún no hay miembros" description="Invita a tu primer colaborador para empezar a operar tu programa." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Miembro</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Tienda</TableHead>
                <TableHead>Última actividad</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-violet-100 text-xs font-semibold text-violet-700">{initials(m.full_name, m.email)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">{m.full_name || '—'}{isSelf(m) && <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">(tú)</span>}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{m.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${ROLE_TONE[m.role] || ROLE_TONE.customer}`}>
                      {ROLE_DISPLAY[m.role] || m.role}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600 dark:text-slate-300">{m.store_name || '—'}</TableCell>
                  <TableCell className="text-sm text-slate-500 dark:text-slate-400"><span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{relTime(m.last_active_at)}</span></TableCell>
                  <TableCell className="text-right">
                    {isSelf(m) || isOwnerRow(m) ? (
                      <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <Select
                          value={m.role === 'merchant' ? 'merchant' : 'business_admin'}
                          onValueChange={(role) => updateRoleMutation.mutate({ id: m.id, role, storeId: m.store_id })}
                          disabled={!canWrite}
                        >
                          <SelectTrigger className="h-8 w-[150px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="business_admin">Administrador</SelectItem>
                            <SelectItem value="merchant">Equipo / Cajero</SelectItem>
                          </SelectContent>
                        </Select>
                        {m.role === 'merchant' && (
                          <Select
                            value={m.store_id || ''}
                            onValueChange={(storeId) => assignStoreMutation.mutate({ id: m.id, storeId })}
                            disabled={!canWrite || stores.length === 0}
                          >
                            <SelectTrigger className="h-8 w-[140px] text-xs">
                              <SelectValue placeholder="Asignar tienda" />
                            </SelectTrigger>
                            <SelectContent>
                              {stores.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => setRemoveTarget(m)} disabled={!canWrite} title="Quitar del equipo">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <SectionCard title="Invitaciones pendientes" description="Personas invitadas que aún no se unen." icon={Mail} className="mt-6" bodyClassName="p-0">
        {invitesQuery.isLoading ? (
          <div className="p-5"><PageLoader label="Cargando invitaciones…" /></div>
        ) : invites.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Mail} title="Sin invitaciones pendientes" description="Las invitaciones que envíes aparecerán aquí." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Tienda</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="text-sm font-medium text-slate-800 dark:text-slate-100">{inv.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{inv.role === 'staff' ? 'Equipo / Cajero' : 'Administrador'}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600 dark:text-slate-300">{inv.store_name || '—'}</TableCell>
                  <TableCell><StatusPill status="open" label="Pendiente" /></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="text-rose-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => setRevokeTarget(inv)} disabled={!canWrite}>
                      Revocar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-3">
          <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            El rol se aplica cuando la persona se registra e ingresa el código de invitación de tu negocio durante su alta.
          </p>
        </div>
      </SectionCard>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitar al equipo</DialogTitle>
            <DialogDescription>Envía una invitación y comparte el código de tu negocio.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">Correo electrónico</Label>
              <Input id="inv-email" type="email" value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} placeholder="persona@correo.mx" />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={inviteForm.role} onValueChange={(role) => setInviteForm((f) => ({ ...f, role }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="business_admin">Administrador</SelectItem>
                  <SelectItem value="staff">Equipo / Cajero</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {inviteForm.role === 'staff' && (
              <div className="space-y-1.5">
                <Label>Tienda (opcional)</Label>
                <Select value={inviteForm.store_id} onValueChange={(store_id) => setInviteForm((f) => ({ ...f, store_id }))} disabled={stores.length === 0}>
                  <SelectTrigger><SelectValue placeholder={stores.length ? 'Selecciona una tienda' : 'Sin tiendas'} /></SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
              <p className="text-xs font-medium text-violet-700">Código de invitación a compartir</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-display text-xl font-bold tracking-[0.25em] text-violet-800 tnum">{business?.invite_code || '——————'}</span>
                <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={copyCode} disabled={!business?.invite_code} aria-label="Copiar código de invitación">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
            <Button onClick={handleInvite} disabled={!canWrite || inviteMutation.isPending || atLimit} className="bg-violet-600 hover:bg-violet-700">
              {inviteMutation.isPending ? 'Enviando…' : 'Enviar invitación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitar del equipo</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget ? `${removeTarget.full_name || removeTarget.email} dejará de tener acceso al negocio y pasará a ser cliente. ¿Continuar?` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" disabled={removeMutation.isPending} onClick={(e) => { e.preventDefault(); removeTarget && removeMutation.mutate(removeTarget.id); }}>
              {removeMutation.isPending ? 'Quitando…' : 'Quitar del equipo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke invitation confirm */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revocar invitación</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget ? `La invitación para ${revokeTarget.email} dejará de ser válida. ¿Continuar?` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" disabled={revokeMutation.isPending} onClick={(e) => { e.preventDefault(); revokeTarget && revokeMutation.mutate(revokeTarget.id); }}>
              {revokeMutation.isPending ? 'Revocando…' : 'Revocar invitación'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
