import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  LifeBuoy,
  Search,
  Send,
  StickyNote,
  UserCheck,
  Inbox,
  MessageSquare,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  PageShell,
  PageHeader,
  SectionCard,
  StatusPill,
  EmptyState,
  PageLoader,
} from '@/components/backoffice/Kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRequirePage } from '@/lib/useCurrentUser';

const now = () => new Date().toISOString();

const STATUS_TABS = [
  { key: 'all', label: 'Todos' },
  { key: 'open', label: 'Abiertos' },
  { key: 'in_progress', label: 'En proceso' },
  { key: 'waiting_customer', label: 'Esperando' },
  { key: 'resolved', label: 'Resueltos' },
  { key: 'closed', label: 'Cerrados' },
];

const STATUS_LABELS = {
  open: 'Abierto',
  in_progress: 'En proceso',
  waiting_customer: 'Esperando cliente',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};

const PRIORITY_LABELS = { low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };

const CATEGORY_LABELS = {
  billing: 'Facturación',
  technical: 'Técnico',
  account: 'Cuenta',
  feature_request: 'Solicitud',
  pos: 'Punto de venta',
  loyalty: 'Lealtad',
  other: 'Otro',
};

function relTime(d) {
  if (!d) return '';
  try {
    return formatDistanceToNow(new Date(d), { addSuffix: true, locale: es });
  } catch {
    return '';
  }
}

export default function PlatformSupport() {
  const { user, ready } = useRequirePage('PlatformSupport');
  const qc = useQueryClient();

  const [search, setSearch] = React.useState('');
  const [statusTab, setStatusTab] = React.useState('all');
  const [priorityFilter, setPriorityFilter] = React.useState('all');
  const [categoryFilter, setCategoryFilter] = React.useState('all');
  const [selectedId, setSelectedId] = React.useState(null);
  const [body, setBody] = React.useState('');
  const [internalNote, setInternalNote] = React.useState(false);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['platform', 'tickets'],
    queryFn: () => base44.entities.SupportTicket.list('-created_date', 500),
    enabled: ready,
  });

  const selected = React.useMemo(
    () => (tickets || []).find((t) => t.id === selectedId) || null,
    [tickets, selectedId],
  );

  const { data: messages, isLoading: loadingMessages } = useQuery({
    queryKey: ['platform', 'ticket-messages', selectedId],
    queryFn: () => base44.entities.SupportTicketMessage.filter({ ticket_id: selectedId }, 'created_date', 200),
    enabled: ready && !!selectedId,
  });

  const openTicket = async (ticket) => {
    setSelectedId(ticket.id);
    setBody('');
    setInternalNote(false);
    if (ticket.unread_for_owner) {
      try {
        await base44.entities.SupportTicket.update(ticket.id, { unread_for_owner: false });
        qc.invalidateQueries({ queryKey: ['platform', 'tickets'] });
      } catch {
        /* non-blocking */
      }
    }
  };

  const replyMutation = useMutation({
    mutationFn: async () => {
      const t = selected;
      const isNote = internalNote;
      await base44.entities.SupportTicketMessage.create({
        ticket_id: t.id,
        business_id: t.business_id,
        author_id: user?.id,
        author_email: user?.email,
        author_name: user?.full_name || user?.email,
        author_role: 'owner',
        body: body.trim(),
        is_internal_note: isNote,
      });
      if (!isNote) {
        await base44.entities.SupportTicket.update(t.id, {
          last_message_at: now(),
          last_message_by_role: 'owner',
          messages_count: (t.messages_count || 0) + 1,
          unread_for_owner: false,
          unread_for_tenant: true,
          first_response_at: t.first_response_at || now(),
          status: t.status === 'open' ? 'in_progress' : t.status,
        });
      }
    },
    onSuccess: () => {
      setBody('');
      setInternalNote(false);
      qc.invalidateQueries({ queryKey: ['platform', 'ticket-messages', selectedId] });
      qc.invalidateQueries({ queryKey: ['platform', 'tickets'] });
      toast.success(internalNote ? 'Nota interna guardada' : 'Respuesta enviada');
    },
    onError: () => toast.error('No se pudo enviar'),
  });

  const statusMutation = useMutation({
    mutationFn: async (status) => {
      const patch = { status };
      if (status === 'resolved') patch.resolved_at = now();
      if (status === 'closed') patch.closed_at = now();
      await base44.entities.SupportTicket.update(selected.id, patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'tickets'] });
      toast.success('Estado actualizado');
    },
    onError: () => toast.error('No se pudo cambiar el estado'),
  });

  const assignMutation = useMutation({
    mutationFn: () => base44.entities.SupportTicket.update(selected.id, { assigned_to: user?.email }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'tickets'] });
      toast.success('Ticket asignado a ti');
    },
    onError: () => toast.error('No se pudo asignar'),
  });

  const filtered = React.useMemo(() => {
    let list = tickets || [];
    if (statusTab !== 'all') list = list.filter((t) => t.status === statusTab);
    if (priorityFilter !== 'all') list = list.filter((t) => t.priority === priorityFilter);
    if (categoryFilter !== 'all') list = list.filter((t) => t.category === categoryFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          (t.subject || '').toLowerCase().includes(q) ||
          (t.business_name || '').toLowerCase().includes(q) ||
          (t.created_by_email || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [tickets, statusTab, priorityFilter, categoryFilter, search]);

  if (!ready) return <PageLoader />;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Consola ACACIA"
        title="Soporte"
        description="Atiende los tickets de todos los negocios de la plataforma."
        icon={LifeBuoy}
        accent="pink"
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Ticket list */}
        <div className="lg:col-span-2 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tickets…"
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda prioridad</SelectItem>
                {Object.keys(PRIORITY_LABELS).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda categoría</SelectItem>
                {Object.keys(CATEGORY_LABELS).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={statusTab} onValueChange={setStatusTab}>
            <TabsList className="flex-wrap h-auto">
              {STATUS_TABS.map((s) => (
                <TabsTrigger key={s.key} value={s.key} className="text-xs">
                  {s.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <SectionCard bodyClassName="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={Inbox} title="Sin tickets" description="No hay tickets que coincidan con los filtros." />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {filtered.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => openTicket(t)}
                      className={cn(
                        'w-full text-left px-4 py-3 transition-colors hover:bg-slate-50',
                        selectedId === t.id && 'bg-violet-50/70',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {t.unread_for_owner && <span className="h-2 w-2 shrink-0 rounded-full bg-violet-500" />}
                          <span className="text-sm font-medium text-slate-800 truncate">{t.subject || 'Sin asunto'}</span>
                        </div>
                        <StatusPill status={t.priority} label={PRIORITY_LABELS[t.priority] || t.priority} />
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-500 truncate">{t.business_name || 'Negocio'}</span>
                        <span className="text-[11px] text-slate-400 shrink-0">{relTime(t.last_message_at || t.created_date)}</span>
                      </div>
                      <div className="mt-1">
                        <StatusPill status={t.status} label={STATUS_LABELS[t.status] || t.status} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        {/* Thread */}
        <div className="lg:col-span-3">
          {!selected ? (
            <SectionCard bodyClassName="p-0">
              <EmptyState
                icon={MessageSquare}
                title="Selecciona un ticket"
                description="Elige un ticket de la lista para ver la conversación y responder."
              />
            </SectionCard>
          ) : (
            <SectionCard
              title={selected.subject || 'Ticket'}
              description={`${selected.business_name || 'Negocio'} · ${CATEGORY_LABELS[selected.category] || selected.category || '—'}`}
              icon={LifeBuoy}
              bodyClassName="p-0"
              actions={
                <div className="flex items-center gap-2">
                  <Select value={selected.status} onValueChange={(v) => statusMutation.mutate(v)}>
                    <SelectTrigger className="w-40 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(STATUS_LABELS).map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending}>
                    <UserCheck className="h-4 w-4 mr-1.5" />
                    {selected.assigned_to === user?.email ? 'Asignado' : 'Asignarme'}
                  </Button>
                </div>
              }
            >
              {/* Messages */}
              <div className="px-5 py-4 space-y-3 max-h-[420px] overflow-y-auto bg-slate-50/40">
                {loadingMessages ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />
                    ))}
                  </div>
                ) : !messages || messages.length === 0 ? (
                  <p className="text-center text-sm text-slate-400 py-8">Aún no hay mensajes en este ticket.</p>
                ) : (
                  messages.map((m) => {
                    const isOwner = m.author_role === 'owner';
                    const isNote = m.is_internal_note;
                    return (
                      <div key={m.id} className={cn('flex', isOwner ? 'justify-end' : 'justify-start')}>
                        <div
                          className={cn(
                            'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm',
                            isNote
                              ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200'
                              : isOwner
                                ? 'bg-violet-600 text-white'
                                : 'bg-white text-slate-800 ring-1 ring-slate-200',
                          )}
                        >
                          {isNote && (
                            <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-amber-200/70 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                              <StickyNote className="h-3 w-3" /> Nota interna
                            </span>
                          )}
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <div
                            className={cn(
                              'mt-1 text-[10px]',
                              isNote ? 'text-amber-600' : isOwner ? 'text-violet-200' : 'text-slate-400',
                            )}
                          >
                            {m.author_name || m.author_email || (isOwner ? 'Soporte' : 'Cliente')}
                            {m.created_date ? ` · ${format(new Date(m.created_date), 'd MMM HH:mm', { locale: es })}` : ''}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Composer */}
              <div className="border-t border-slate-100 p-4 space-y-3">
                <Textarea
                  rows={3}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={internalNote ? 'Escribe una nota interna (solo visible para ACACIA)…' : 'Escribe tu respuesta…'}
                  className={cn(internalNote && 'bg-amber-50/50')}
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Switch id="note-toggle" checked={internalNote} onCheckedChange={setInternalNote} />
                    <Label htmlFor="note-toggle" className="text-xs text-slate-600 cursor-pointer">
                      Nota interna
                    </Label>
                  </div>
                  <Button
                    size="sm"
                    className={internalNote ? 'bg-amber-500 hover:bg-amber-600' : 'bg-violet-600 hover:bg-violet-700'}
                    disabled={replyMutation.isPending || !body.trim()}
                    onClick={() => replyMutation.mutate()}
                  >
                    {internalNote ? <StickyNote className="h-4 w-4 mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
                    {internalNote ? 'Guardar nota' : 'Responder'}
                  </Button>
                </div>
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </PageShell>
  );
}
