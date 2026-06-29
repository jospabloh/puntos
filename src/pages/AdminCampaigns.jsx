import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequirePage } from '@/lib/useCurrentUser';
import { getActiveBusinessId, getActiveBusinessName } from '@/lib/activeTenant';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Plus,
  Calendar,
  Gift,
  Edit,
  Trash2,
  MoreVertical,
  Play,
  Pause,
  Star,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { PageShell, PageHeader, StatTile, StatusPill, EmptyState, PageLoader } from '@/components/backoffice/Kit';

const EMPTY_CAMPAIGN = {
  name: '',
  description: '',
  type: 'multiplier',
  status: 'draft',
  start_date: '',
  end_date: '',
  multiplier: 2,
  bonus_points: 0,
  min_purchase: 0,
};

const EMPTY_OFFER = {
  title: '',
  description: '',
  short_description: '',
  type: 'discount',
  points_cost: 100,
  value_mxn: 50,
  category: 'shopping',
  status: 'active',
  stock: -1,
  image_url: '',
};

const CAMPAIGN_STATUS = {
  draft: { pill: 'archived', label: 'Borrador' },
  active: { pill: 'active', label: 'Activa' },
  paused: { pill: 'view_only', label: 'Pausada' },
  ended: { pill: 'closed', label: 'Finalizada' },
  inactive: { pill: 'archived', label: 'Inactiva' },
};

const OFFER_STATUS = {
  active: { pill: 'active', label: 'Activa' },
  inactive: { pill: 'archived', label: 'Inactiva' },
  soldout: { pill: 'suspended', label: 'Agotada' },
};

function campaignPill(status) {
  const c = CAMPAIGN_STATUS[status] || { pill: 'default', label: status || '—' };
  return <StatusPill status={c.pill} label={c.label} />;
}

function offerPill(status) {
  const o = OFFER_STATUS[status] || { pill: 'default', label: status || '—' };
  return <StatusPill status={o.pill} label={o.label} />;
}

function CampaignCard({ campaign, index, onEdit, onDelete, onNotify, notifyDisabled }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      className="flex flex-col rounded-2xl border border-slate-200/70 bg-white p-5 pp-card-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-display font-semibold text-slate-900" title={campaign.name}>{campaign.name || 'Sin nombre'}</h3>
            {campaign.description && <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{campaign.description}</p>}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="-mr-1 shrink-0" aria-label={`Acciones de ${campaign.name || 'campaña'}`}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(campaign)}><Edit className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNotify(campaign)} disabled={notifyDisabled}><Send className="mr-2 h-4 w-4" />Notificar usuarios</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(campaign.id)} className="text-rose-600 focus:text-rose-600"><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {campaignPill(campaign.status)}
        <Badge variant="outline" className="gap-1">
          {campaign.status === 'active' && <Play className="h-3 w-3" />}
          {campaign.status === 'paused' && <Pause className="h-3 w-3" />}
          {campaign.type === 'multiplier' && `x${campaign.multiplier}`}
          {campaign.type === 'bonus' && `+${campaign.bonus_points} pts`}
          {campaign.type === 'threshold' && 'Por umbral'}
        </Badge>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-sm text-slate-500">
        <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="tnum">
          {campaign.start_date ? format(new Date(campaign.start_date), 'd MMM', { locale: es }) : 'Sin fecha'}
          {' — '}
          {campaign.end_date ? format(new Date(campaign.end_date), 'd MMM', { locale: es }) : 'Sin fecha'}
        </span>
      </div>
    </motion.div>
  );
}

function OfferCard({ offer, index, onEdit, onDelete, onNotify, notifyDisabled }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white pp-card-hover"
    >
      {offer.image_url && (
        <img src={offer.image_url} alt={offer.title} className="h-32 w-full object-cover" />
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {!offer.image_url && (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <Gift className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0">
              <h3 className="truncate font-display font-semibold text-slate-900" title={offer.title}>{offer.title || 'Sin título'}</h3>
              {offer.short_description && <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{offer.short_description}</p>}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-mr-1 shrink-0" aria-label={`Acciones de ${offer.title || 'oferta'}`}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(offer)}><Edit className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onNotify(offer)} disabled={notifyDisabled}><Send className="mr-2 h-4 w-4" />Notificar usuarios</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(offer.id)} className="text-rose-600 focus:text-rose-600"><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="inline-flex items-center gap-1 font-semibold text-violet-600 tnum">
            <Star className="h-4 w-4 text-violet-500" />
            {(offer.points_cost || 0).toLocaleString('es-MX')}
          </span>
          {offerPill(offer.status)}
        </div>
      </div>
    </motion.div>
  );
}

export default function AdminCampaigns() {
  const { user, role, ready } = useRequirePage('AdminCampaigns');
  const [tab, setTab] = useState('campaigns');
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [showOfferDialog, setShowOfferDialog] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [editingOffer, setEditingOffer] = useState(null);
  const queryClient = useQueryClient();

  const [campaignForm, setCampaignForm] = useState(EMPTY_CAMPAIGN);
  const [offerForm, setOfferForm] = useState(EMPTY_OFFER);

  // Tenant scoping: owner sees everything ({}), business_admin only their business.
  const activeBusinessId = getActiveBusinessId(user);
  const scope = { business_id: activeBusinessId };
  const scopeKey = activeBusinessId || 'none';

  // Fetch campaigns
  const { data: campaigns, isLoading: loadingCampaigns } = useQuery({
    queryKey: ['allCampaigns', scopeKey],
    queryFn: () => base44.entities.Campaign.filter(scope, '-created_date'),
    enabled: !!user,
  });

  // Fetch offers
  const { data: offers, isLoading: loadingOffers } = useQuery({
    queryKey: ['allOffers', scopeKey],
    queryFn: () => base44.entities.Offer.filter(scope, '-created_date'),
    enabled: !!user,
  });

  // Campaign mutations
  const saveCampaignMutation = useMutation({
    mutationFn: async (data) => {
      if (editingCampaign) {
        return base44.entities.Campaign.update(editingCampaign.id, data);
      }
      return base44.entities.Campaign.create({
        ...data,
        business_id: activeBusinessId,
        business_name: getActiveBusinessName(user),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allCampaigns'] });
      setShowCampaignDialog(false);
      setEditingCampaign(null);
      toast.success(editingCampaign ? 'Campaña actualizada' : 'Campaña creada');
    },
    onError: (e) => {
      toast.error(e?.message || 'Error al guardar la campaña');
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: (id) => base44.entities.Campaign.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allCampaigns'] });
      toast.success('Campaña eliminada');
    },
    onError: (e) => {
      toast.error(e?.message || 'Error al eliminar la campaña');
    },
  });

  // Offer mutations
  const saveOfferMutation = useMutation({
    mutationFn: async (data) => {
      if (editingOffer) {
        return base44.entities.Offer.update(editingOffer.id, data);
      }
      return base44.entities.Offer.create({
        ...data,
        business_id: activeBusinessId,
        business_name: getActiveBusinessName(user),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allOffers'] });
      setShowOfferDialog(false);
      setEditingOffer(null);
      toast.success(editingOffer ? 'Oferta actualizada' : 'Oferta creada');
    },
    onError: (e) => {
      toast.error(e?.message || 'Error al guardar la oferta');
    },
  });

  const deleteOfferMutation = useMutation({
    mutationFn: (id) => base44.entities.Offer.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allOffers'] });
      toast.success('Oferta eliminada');
    },
    onError: (e) => {
      toast.error(e?.message || 'Error al eliminar la oferta');
    },
  });

  // Send campaign notifications
  const notifyCampaignMutation = useMutation({
    mutationFn: async (campaign) => {
      // Fetch users with notification preferences enabled, scoped to this tenant
      // (owner -> all). Filtering unscoped would email every tenant's customers.
      const allPreferences = await base44.entities.NotificationPreference.filter(scope);
      const enabledUsers = (allPreferences || []).filter((pref) => pref.campaigns_enabled && pref.user_email);

      // Send emails to all subscribed users
      const emailPromises = enabledUsers.map((pref) =>
        base44.integrations.Core.SendEmail({
          from_name: 'Puntos+',
          to: pref.user_email,
          subject: `Nueva campaña: ${campaign.name.replace(/[<>&"]/g, '')}`,
          body: [
            'Hola,',
            '',
            '¡Tenemos una nueva campaña para ti!',
            '',
            campaign.name.replace(/[<>&"]/g, ''),
            (campaign.description || '').replace(/[<>&"]/g, ''),
            '',
            campaign.type === 'multiplier'
              ? `Gana puntos x${campaign.multiplier}`
              : `Recibe ${campaign.bonus_points} puntos bonus`,
            '',
            `Válida desde ${campaign.start_date ? format(new Date(campaign.start_date), "d 'de' MMMM", { locale: es }) : 'hoy'} hasta ${campaign.end_date ? format(new Date(campaign.end_date), "d 'de' MMMM", { locale: es }) : 'nuevo aviso'}.`,
            '',
            '¡Aprovecha ahora!',
            '',
            'Equipo Puntos+',
          ].join('\n'),
        }),
      );

      await Promise.all(emailPromises);
      return enabledUsers.length;
    },
    onSuccess: (count) => {
      toast.success(`Notificación enviada a ${count} usuarios`);
    },
    onError: () => {
      toast.error('Error al enviar notificaciones');
    },
  });

  // Send offer notifications
  const notifyOfferMutation = useMutation({
    mutationFn: async (offer) => {
      const allPreferences = await base44.entities.NotificationPreference.filter(scope);
      const enabledUsers = (allPreferences || []).filter((pref) => pref.offers_enabled && pref.user_email);

      const emailPromises = enabledUsers.map((pref) =>
        base44.integrations.Core.SendEmail({
          from_name: 'Puntos+',
          to: pref.user_email,
          subject: `Nueva oferta disponible: ${offer.title.replace(/[<>&"]/g, '')}`,
          body: [
            'Hola,',
            '',
            '¡Tenemos una nueva oferta especial para ti!',
            '',
            offer.title.replace(/[<>&"]/g, ''),
            (offer.description || '').replace(/[<>&"]/g, ''),
            '',
            `Costo: ${(offer.points_cost || 0).toLocaleString('es-MX')} puntos`,
            `Valor: $${(offer.value_mxn || 0).toLocaleString('es-MX')} MXN`,
            '',
            offer.stock > 0 ? `Stock limitado: ${offer.stock} disponibles` : '¡Disponibilidad ilimitada!',
            '',
            '¡Canjea ahora en la app!',
            '',
            'Equipo Puntos+',
          ].join('\n'),
        }),
      );

      await Promise.all(emailPromises);
      return enabledUsers.length;
    },
    onSuccess: (count) => {
      toast.success(`Notificación enviada a ${count} usuarios`);
    },
    onError: () => {
      toast.error('Error al enviar notificaciones');
    },
  });

  const handleEditCampaign = (campaign) => {
    setEditingCampaign(campaign);
    setCampaignForm({
      name: campaign.name || '',
      description: campaign.description || '',
      type: campaign.type || 'multiplier',
      status: campaign.status || 'draft',
      start_date: campaign.start_date ? campaign.start_date.split('T')[0] : '',
      end_date: campaign.end_date ? campaign.end_date.split('T')[0] : '',
      multiplier: campaign.multiplier || 2,
      bonus_points: campaign.bonus_points || 0,
      min_purchase: campaign.min_purchase || 0,
    });
    setShowCampaignDialog(true);
  };

  const handleEditOffer = (offer) => {
    setEditingOffer(offer);
    setOfferForm({
      title: offer.title || '',
      description: offer.description || '',
      short_description: offer.short_description || '',
      type: offer.type || 'discount',
      points_cost: offer.points_cost || 100,
      value_mxn: offer.value_mxn || 50,
      category: offer.category || 'shopping',
      status: offer.status || 'active',
      stock: offer.stock ?? -1,
      image_url: offer.image_url || '',
    });
    setShowOfferDialog(true);
  };

  const resetCampaignForm = () => {
    setCampaignForm(EMPTY_CAMPAIGN);
    setEditingCampaign(null);
  };

  const resetOfferForm = () => {
    setOfferForm(EMPTY_OFFER);
    setEditingOffer(null);
  };

  if (!ready) return <PageLoader />;

  const allCampaigns = campaigns || [];
  const allOffers = offers || [];
  const activeCampaigns = allCampaigns.filter((c) => c.status === 'active').length;
  const activeOffers = allOffers.filter((o) => o.status === 'active').length;

  const openNewCampaign = () => { resetCampaignForm(); setShowCampaignDialog(true); };
  const openNewOffer = () => { resetOfferForm(); setShowOfferDialog(true); };

  return (
    <PageShell>
      <PageHeader
        icon={Sparkles}
        eyebrow="Marketing"
        title="Campañas y recompensas"
        description="Gestiona promociones de puntos y el catálogo de recompensas canjeables."
        actions={tab === 'campaigns' ? (
          <Button onClick={openNewCampaign} className="bg-violet-600 hover:bg-violet-700"><Plus className="mr-2 h-4 w-4" />Nueva campaña</Button>
        ) : (
          <Button onClick={openNewOffer} className="bg-violet-600 hover:bg-violet-700"><Plus className="mr-2 h-4 w-4" />Nueva recompensa</Button>
        )}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Campañas" value={allCampaigns.length} icon={Sparkles} tone="violet" loading={loadingCampaigns} />
        <StatTile label="Campañas activas" value={activeCampaigns} icon={CheckCircle2} tone="emerald" loading={loadingCampaigns} />
        <StatTile label="Recompensas" value={allOffers.length} icon={Gift} tone="gold" loading={loadingOffers} />
        <StatTile label="Recompensas activas" value={activeOffers} icon={CheckCircle2} tone="emerald" loading={loadingOffers} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="campaigns" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Campañas
          </TabsTrigger>
          <TabsTrigger value="offers" className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            Recompensas
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Campaigns Tab */}
      {tab === 'campaigns' && (
        loadingCampaigns ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-200/70 bg-white" />)}
          </div>
        ) : allCampaigns.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {allCampaigns.map((campaign, i) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                index={i}
                onEdit={handleEditCampaign}
                onDelete={(id) => deleteCampaignMutation.mutate(id)}
                onNotify={(c) => notifyCampaignMutation.mutate(c)}
                notifyDisabled={notifyCampaignMutation.isPending}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Sparkles}
            title="Aún no tienes campañas"
            description="Crea tu primera campaña para premiar a tus clientes con puntos extra."
            action={<Button onClick={openNewCampaign} className="bg-violet-600 hover:bg-violet-700"><Plus className="mr-2 h-4 w-4" />Nueva campaña</Button>}
          />
        )
      )}

      {/* Offers Tab */}
      {tab === 'offers' && (
        loadingOffers ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-200/70 bg-white" />)}
          </div>
        ) : allOffers.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {allOffers.map((offer, i) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                index={i}
                onEdit={handleEditOffer}
                onDelete={(id) => deleteOfferMutation.mutate(id)}
                onNotify={(o) => notifyOfferMutation.mutate(o)}
                notifyDisabled={notifyOfferMutation.isPending}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Gift}
            title="Aún no tienes recompensas"
            description="Crea tu primera recompensa para que tus clientes canjeen sus puntos."
            action={<Button onClick={openNewOffer} className="bg-violet-600 hover:bg-violet-700"><Plus className="mr-2 h-4 w-4" />Nueva recompensa</Button>}
          />
        )
      )}

      {/* Campaign Dialog */}
      <Dialog open={showCampaignDialog} onOpenChange={(open) => { setShowCampaignDialog(open); if (!open) resetCampaignForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCampaign ? 'Editar campaña' : 'Nueva campaña'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveCampaignMutation.mutate(campaignForm); }} className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} required autoFocus />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea value={campaignForm.description} onChange={(e) => setCampaignForm({ ...campaignForm, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo</Label>
                <Select value={campaignForm.type} onValueChange={(v) => setCampaignForm({ ...campaignForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiplier">Multiplicador</SelectItem>
                    <SelectItem value="bonus">Bonus fijo</SelectItem>
                    <SelectItem value="threshold">Por umbral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estado</Label>
                <Select value={campaignForm.status} onValueChange={(v) => setCampaignForm({ ...campaignForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Borrador</SelectItem>
                    <SelectItem value="active">Activa</SelectItem>
                    <SelectItem value="paused">Pausada</SelectItem>
                    <SelectItem value="ended">Finalizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Fecha inicio</Label>
                <Input type="date" value={campaignForm.start_date} onChange={(e) => setCampaignForm({ ...campaignForm, start_date: e.target.value })} />
              </div>
              <div>
                <Label>Fecha fin</Label>
                <Input type="date" value={campaignForm.end_date} onChange={(e) => setCampaignForm({ ...campaignForm, end_date: e.target.value })} />
              </div>
            </div>
            {campaignForm.type === 'multiplier' && (
              <div>
                <Label>Multiplicador</Label>
                <Input type="number" value={campaignForm.multiplier} onChange={(e) => setCampaignForm({ ...campaignForm, multiplier: parseFloat(e.target.value) || 0 })} min={1} step={0.5} />
              </div>
            )}
            {campaignForm.type === 'bonus' && (
              <div>
                <Label>Puntos bonus</Label>
                <Input type="number" value={campaignForm.bonus_points} onChange={(e) => setCampaignForm({ ...campaignForm, bonus_points: parseInt(e.target.value) || 0 })} min={0} />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCampaignDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveCampaignMutation.isPending} className="bg-violet-600 hover:bg-violet-700">
                {saveCampaignMutation.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Offer Dialog */}
      <Dialog open={showOfferDialog} onOpenChange={(open) => { setShowOfferDialog(open); if (!open) resetOfferForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingOffer ? 'Editar recompensa' : 'Nueva recompensa'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveOfferMutation.mutate(offerForm); }} className="space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <Label>Título</Label>
              <Input value={offerForm.title} onChange={(e) => setOfferForm({ ...offerForm, title: e.target.value })} required autoFocus />
            </div>
            <div>
              <Label>Descripción corta</Label>
              <Input value={offerForm.short_description} onChange={(e) => setOfferForm({ ...offerForm, short_description: e.target.value })} />
            </div>
            <div>
              <Label>Descripción completa</Label>
              <Textarea value={offerForm.description} onChange={(e) => setOfferForm({ ...offerForm, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo</Label>
                <Select value={offerForm.type} onValueChange={(v) => setOfferForm({ ...offerForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="discount">Descuento</SelectItem>
                    <SelectItem value="product">Producto</SelectItem>
                    <SelectItem value="experience">Experiencia</SelectItem>
                    <SelectItem value="cashback">Cashback</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Categoría</Label>
                <Select value={offerForm.category} onValueChange={(v) => setOfferForm({ ...offerForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="food">Comida</SelectItem>
                    <SelectItem value="shopping">Compras</SelectItem>
                    <SelectItem value="travel">Viajes</SelectItem>
                    <SelectItem value="entertainment">Entretenimiento</SelectItem>
                    <SelectItem value="services">Servicios</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Costo en puntos</Label>
                <Input type="number" value={offerForm.points_cost} onChange={(e) => setOfferForm({ ...offerForm, points_cost: parseInt(e.target.value) || 0 })} min={1} />
              </div>
              <div>
                <Label>Valor en MXN</Label>
                <Input type="number" value={offerForm.value_mxn} onChange={(e) => setOfferForm({ ...offerForm, value_mxn: parseFloat(e.target.value) || 0 })} min={0} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Estado</Label>
                <Select value={offerForm.status} onValueChange={(v) => setOfferForm({ ...offerForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activa</SelectItem>
                    <SelectItem value="inactive">Inactiva</SelectItem>
                    <SelectItem value="soldout">Agotada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Stock (-1 = ilimitado)</Label>
                <Input type="number" value={offerForm.stock} onChange={(e) => { const v = parseInt(e.target.value); setOfferForm({ ...offerForm, stock: Number.isNaN(v) ? -1 : v }); }} min={-1} />
              </div>
            </div>
            <div>
              <Label>URL de imagen</Label>
              <Input value={offerForm.image_url} onChange={(e) => setOfferForm({ ...offerForm, image_url: e.target.value })} placeholder="https://..." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowOfferDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveOfferMutation.isPending} className="bg-violet-600 hover:bg-violet-700">
                {saveOfferMutation.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}