import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  LifeBuoy,
  Plus,
  Send,
  Star,
  ArrowLeft,
  MessageSquare,
  Headset,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  PageShell,
  PageHeader,
  SectionCard,
  StatusPill,
  EmptyState,
  PageLoader,
} from '@/components/backoffice/Kit';
import { useRequirePage } from '@/lib/useCurrentUser';

const CATEGORIES = [
  { value: 'billing', label: 'Facturación' },
  { value: 'technical', label: 'Técnico' },
  { value: 'account', label: 'Cuenta' },
  { value: 'feature_request', label: 'Solicitud de función' },
  { value: 'pos', label: 'Punto de venta' },
  { value: 'loyalty', label: 'Lealtad / Puntos' },
  { value: 'other', label: 'Otro' },
];

const PRIORITIES = [
  { value: 'low', label: 'Baja' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

function fmtDateTime(d) {
  if (!d) return '';
  try {
    return format(new Date(d), "d 'de' MMM, HH:mm", { locale: es });
  } catch {
    return '';
  }
}

function relTime(d) {
  if (!d) return '';
  try {
    return formatDistanceToNow(new Date(d), { addSuffix: true, locale: es });
  } catch {
    return '';
  }
}

export default function BusinessSupport() {
  const { user, ready } = useRequirePage('BusinessSupport');
  const queryClient = useQueryClient();
  const businessId = user?.business_id;

  const [activeId, setActiveId] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ subject: '', category: 'technical', priority: 'normal', description: '' });
  const [reply, setReply] = useState('');
  const threadEndRef = useRef(null);

  const ticketsQuery = useQuery({
    queryKey: ['support-tickets', businessId],
    enabled: !!businessId && ready,
    queryFn: () => base44.entities.SupportTicket.filter({ business_id: businessId }, '-last_message_at', 200),
  });
  const tickets = ticketsQuery.data || [];
  const activeTicket = tickets.find((t) => t.id === activeId) || null;

  const messagesQuery = useQuery({
    queryKey: ['support-messages', activeId],
    enabled: !!activeId,
    queryFn: () => base44.entities.SupportTicketMessage.filter({ ticket_id: activeId }, 'created_date', 200),
  });
  const messages = messagesQuery.data || [];

  // Mark unread_for_tenant=false when opening a ticket
  useEffect(() => {
    if (activeTicket && activeTicket.unread_for_tenant) {
      base44.entities.SupportTicket.update(activeTicket.id, { unread_for_tenant: false })
        .then(() => queryClient.invalidateQueries({ queryKey: ['support-tickets', businessId] }))
        .catch(() => {});
    }
  }, [activeTicket, businessId, queryClient]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const ticket = await base44.entities.SupportTicket.create({
        business_id: businessId,
        business_name: user?.business_name || '',
        subject: form.subject.trim(),
        description: form.description.trim(),
        category: form.category,
        priority: form.priority,
        status: 'open',
        created_by_id: user?.id,
        created_by_email: user?.email,
        unread_for_owner: true,
        unread_for_tenant: false,
        last_message_at: now,
        last_message_by_role: 'tenant',
        messages_count: 1,
      });
      await base44.entities.SupportTicketMessage.create({
        ticket_id: ticket.id,
        business_id: businessId,
        author_id: user?.id,
        author_email: user?.email,
        author_name: user?.full_name,
        author_role: 'tenant',
        body: form.description.trim(),
        is_internal_note: false,
      });
      // Push en tiempo real a ACACIA Mission Control (no bloquea la UI): notifica
      // al equipo de soporte y refleja el ticket sin sincronización manual.
      base44.functions.invoke('notifyTicketCreated', { ticketId: ticket.id }).catch(() => {});
      return ticket;
    },
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets', businessId] });
      setNewOpen(false);
      setForm({ subject: '', category: 'technical', priority: 'normal', description: '' });
      setActiveId(ticket.id);
      toast.success('Ticket creado');
    },
    onError: () => toast.error('No se pudo crear el ticket'),
  });

  const replyMutation = useMutation({
    mutationFn: async (body) => {
      const now = new Date().toISOString();
      await base44.entities.SupportTicketMessage.create({
        ticket_id: activeTicket.id,
        business_id: businessId,
        author_id: user?.id,
        author_email: user?.email,
        author_name: user?.full_name,
        author_role: 'tenant',
        body,
        is_internal_note: false,
      });
      await base44.entities.SupportTicket.update(activeTicket.id, {
        last_message_at: now,
        last_message_by_role: 'tenant',
        unread_for_owner: true,
        messages_count: (activeTicket.messages_count || messages.length || 0) + 1,
      });
    },
    onSuccess: () => {
      setReply('');
      queryClient.invalidateQueries({ queryKey: ['support-messages', activeId] });
      queryClient.invalidateQueries({ queryKey: ['support-tickets', businessId] });
    },
    onError: () => toast.error('No se pudo enviar el mensaje'),
  });

  const ratingMutation = useMutation({
    mutationFn: ({ rating, close }) =>
      base44.entities.SupportTicket.update(activeTicket.id, close ? { satisfaction_rating: rating, status: 'closed' } : { satisfaction_rating: rating }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets', businessId] });
      toast.success('¡Gracias por tu opinión!');
    },
    onError: () => toast.error('No se pudo guardar tu calificación'),
  });

  if (!ready) return <PageLoader />;

  const handleCreate = () => {
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error('Completa el asunto y la descripción');
      return;
    }
    createMutation.mutate();
  };

  const handleReply = () => {
    if (!reply.trim()) return;
    replyMutation.mutate(reply.trim());
  };

  // Thread view
  if (activeTicket) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Soporte"
          title={activeTicket.subject}
          description={`${CATEGORY_LABEL[activeTicket.category] || activeTicket.category} · ${relTime(activeTicket.last_message_at || activeTicket.created_date)}`}
          icon={MessageSquare}
          actions={
            <div className="flex items-center gap-2">
              <StatusPill status={activeTicket.status} />
              <Button variant="outline" onClick={() => setActiveId(null)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Volver
              </Button>
            </div>
          }
        />

        <SectionCard title="Conversación" icon={MessageSquare} bodyClassName="p-0">
          <div className="max-h-[55vh] space-y-4 overflow-y-auto p-5">
            {messagesQuery.isLoading ? (
              <PageLoader label="Cargando mensajes…" />
            ) : messages.length === 0 ? (
              <EmptyState icon={MessageSquare} title="Sin mensajes" description="Aún no hay mensajes en este ticket." />
            ) : (
              messages.map((m) => {
                const mine = m.author_role === 'tenant';
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${mine ? 'bg-violet-600 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}>
                      <div className={`mb-0.5 flex items-center gap-1.5 text-[11px] font-medium ${mine ? 'text-white/80' : 'text-slate-500'}`}>
                        {!mine && <Headset className="h-3 w-3" />}
                        {mine ? (m.author_name || 'Tú') : 'Soporte Puntos+'}
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                      <div className={`mt-1 text-[10px] ${mine ? 'text-white/60' : 'text-slate-400'}`}>{fmtDateTime(m.created_date)}</div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={threadEndRef} />
          </div>

          {/* Satisfaction rating when resolved */}
          {activeTicket.status === 'resolved' && (
            <div className="border-t border-slate-100 bg-emerald-50/50 px-5 py-4">
              <p className="text-sm font-medium text-slate-700">¿Qué tan satisfecho quedaste con la atención?</p>
              <div className="mt-2 flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => ratingMutation.mutate({ rating: n, close: false })}
                    className="p-0.5"
                    aria-label={`${n} estrellas`}
                  >
                    <Star className={`h-6 w-6 transition ${n <= (activeTicket.satisfaction_rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-300 hover:text-amber-300'}`} />
                  </button>
                ))}
                {activeTicket.satisfaction_rating ? (
                  <Button variant="outline" size="sm" className="ml-3" onClick={() => ratingMutation.mutate({ rating: activeTicket.satisfaction_rating, close: true })}>
                    Cerrar ticket
                  </Button>
                ) : null}
              </div>
            </div>
          )}

          {/* Composer */}
          {activeTicket.status !== 'closed' && (
            <div className="border-t border-slate-100 p-4">
              <div className="flex items-end gap-2">
                <Textarea
                  rows={2}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Escribe tu mensaje…"
                  className="resize-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleReply();
                  }}
                />
                <Button onClick={handleReply} disabled={!reply.trim() || replyMutation.isPending} className="bg-violet-600 hover:bg-violet-700" aria-label="Enviar mensaje">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </SectionCard>
      </PageShell>
    );
  }

  // List view
  return (
    <PageShell>
      <PageHeader
        eyebrow="Soporte"
        title="Centro de soporte"
        description="Crea tickets y da seguimiento a tus conversaciones con el equipo de Puntos+."
        icon={LifeBuoy}
        actions={
          <Button onClick={() => setNewOpen(true)} className="bg-violet-600 hover:bg-violet-700">
            <Plus className="mr-2 h-4 w-4" /> Nuevo ticket
          </Button>
        }
      />

      <SectionCard title="Mis tickets" description={`${tickets.length} ${tickets.length === 1 ? 'ticket' : 'tickets'}`} icon={MessageSquare} bodyClassName="p-0">
        {ticketsQuery.isLoading ? (
          <div className="p-5"><PageLoader label="Cargando tickets…" /></div>
        ) : tickets.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={LifeBuoy}
              title="No tienes tickets"
              description="Crea un ticket para recibir ayuda del equipo de Puntos+."
              action={<Button onClick={() => setNewOpen(true)} className="bg-violet-600 hover:bg-violet-700"><Plus className="mr-2 h-4 w-4" />Nuevo ticket</Button>}
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tickets.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(t.id)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{t.subject}</p>
                      {t.unread_for_tenant && <span className="h-2 w-2 shrink-0 rounded-full bg-violet-500" title="Nuevo mensaje" />}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {CATEGORY_LABEL[t.category] || t.category} · {relTime(t.last_message_at || t.created_date)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill status={t.priority} label={PRIORITIES.find((p) => p.value === t.priority)?.label} />
                    <StatusPill status={t.status} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* New ticket dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo ticket</DialogTitle>
            <DialogDescription>Describe tu solicitud y el equipo de soporte te responderá.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-subject">Asunto</Label>
              <Input id="t-subject" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Resumen breve del problema" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={form.category} onValueChange={(category) => setForm((f) => ({ ...f, category }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioridad</Label>
                <Select value={form.priority} onValueChange={(priority) => setForm((f) => ({ ...f, priority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-desc">Descripción</Label>
              <Textarea id="t-desc" rows={5} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Cuéntanos con detalle qué necesitas…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} className="bg-violet-600 hover:bg-violet-700">
              {createMutation.isPending ? 'Creando…' : 'Crear ticket'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
