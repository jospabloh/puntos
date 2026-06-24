import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequirePage } from '@/lib/useCurrentUser';
import { ROLES } from '@/lib/rbac';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Plus,
  Calendar,
  Gift,
  Edit,
  Trash2,
  ArrowLeft,
  MoreVertical,
  Play,
  Pause,
  Star,
  Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
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

export default function AdminCampaigns() {
  const { user, role, ready } = useRequirePage('AdminCampaigns');
  const [tab, setTab] = useState('campaigns');
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [showOfferDialog, setShowOfferDialog] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [editingOffer, setEditingOffer] = useState(null);
  const queryClient = useQueryClient();

  const [campaignForm, setCampaignForm] = useState({
    name: '',
    description: '',
    type: 'multiplier',
    status: 'draft',
    start_date: '',
    end_date: '',
    multiplier: 2,
    bonus_points: 0,
    min_purchase: 0
  });

  const [offerForm, setOfferForm] = useState({
    title: '',
    description: '',
    short_description: '',
    type: 'discount',
    points_cost: 100,
    value_mxn: 50,
    category: 'shopping',
    status: 'active',
    stock: -1,
    image_url: ''
  });

  // Tenant scoping: owner sees everything ({}), business_admin only their business.
  const scope = role === ROLES.OWNER ? {} : { business_id: user?.business_id };
  const scopeKey = role === ROLES.OWNER ? 'all' : user?.business_id;

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
        business_id: user.business_id,
        business_name: user.business_name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['allCampaigns']);
      setShowCampaignDialog(false);
      setEditingCampaign(null);
      toast.success(editingCampaign ? 'Campaña actualizada' : 'Campaña creada');
    }
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: (id) => base44.entities.Campaign.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['allCampaigns']);
      toast.success('Campaña eliminada');
    }
  });

  // Offer mutations
  const saveOfferMutation = useMutation({
    mutationFn: async (data) => {
      if (editingOffer) {
        return base44.entities.Offer.update(editingOffer.id, data);
      }
      return base44.entities.Offer.create({
        ...data,
        business_id: user.business_id,
        business_name: user.business_name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['allOffers']);
      setShowOfferDialog(false);
      setEditingOffer(null);
      toast.success(editingOffer ? 'Oferta actualizada' : 'Oferta creada');
    }
  });

  const deleteOfferMutation = useMutation({
    mutationFn: (id) => base44.entities.Offer.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['allOffers']);
      toast.success('Oferta eliminada');
    }
  });

  // Send campaign notifications
  const notifyCampaignMutation = useMutation({
    mutationFn: async (campaign) => {
      // Fetch all users with notification preferences enabled
      const allPreferences = await base44.entities.NotificationPreference.list();
      const enabledUsers = allPreferences.filter(pref => pref.campaigns_enabled);

      // Send emails to all subscribed users
      const emailPromises = enabledUsers.map(pref => 
        base44.integrations.Core.SendEmail({
          from_name: 'Puntos+',
          to: pref.user_email,
          subject: `🎉 Nueva campaña: ${campaign.name}`,
          body: `Hola,\n\n¡Tenemos una nueva campaña para ti!\n\n**${campaign.name}**\n${campaign.description}\n\n${campaign.type === 'multiplier' ? `Gana puntos x${campaign.multiplier}` : `Recibe ${campaign.bonus_points} puntos bonus`}\n\nVálida desde ${campaign.start_date ? format(new Date(campaign.start_date), "d 'de' MMMM", { locale: es }) : 'hoy'} hasta ${campaign.end_date ? format(new Date(campaign.end_date), "d 'de' MMMM", { locale: es }) : 'nuevo aviso'}.\n\n¡Aprovecha ahora!\n\nEquipo Puntos+`
        })
      );

      await Promise.all(emailPromises);
      return enabledUsers.length;
    },
    onSuccess: (count) => {
      toast.success(`Notificación enviada a ${count} usuarios`);
    },
    onError: () => {
      toast.error('Error al enviar notificaciones');
    }
  });

  // Send offer notifications
  const notifyOfferMutation = useMutation({
    mutationFn: async (offer) => {
      const allPreferences = await base44.entities.NotificationPreference.list();
      const enabledUsers = allPreferences.filter(pref => pref.offers_enabled);

      const emailPromises = enabledUsers.map(pref => 
        base44.integrations.Core.SendEmail({
          from_name: 'Puntos+',
          to: pref.user_email,
          subject: `🎁 Nueva oferta disponible: ${offer.title}`,
          body: `Hola,\n\n¡Tenemos una nueva oferta especial para ti!\n\n**${offer.title}**\n${offer.description}\n\nCosto: ${offer.points_cost.toLocaleString()} puntos\nValor: $${offer.value_mxn.toLocaleString()} MXN\n\n${offer.stock > 0 ? `Stock limitado: ${offer.stock} disponibles` : '¡Disponibilidad ilimitada!'}\n\n¡Canjea ahora en la app!\n\nEquipo Puntos+`
        })
      );

      await Promise.all(emailPromises);
      return enabledUsers.length;
    },
    onSuccess: (count) => {
      toast.success(`Notificación enviada a ${count} usuarios`);
    },
    onError: () => {
      toast.error('Error al enviar notificaciones');
    }
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
      min_purchase: campaign.min_purchase || 0
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
      image_url: offer.image_url || ''
    });
    setShowOfferDialog(true);
  };

  const resetCampaignForm = () => {
    setCampaignForm({
      name: '',
      description: '',
      type: 'multiplier',
      status: 'draft',
      start_date: '',
      end_date: '',
      multiplier: 2,
      bonus_points: 0,
      min_purchase: 0
    });
    setEditingCampaign(null);
  };

  const resetOfferForm = () => {
    setOfferForm({
      title: '',
      description: '',
      short_description: '',
      type: 'discount',
      points_cost: 100,
      value_mxn: 50,
      category: 'shopping',
      status: 'active',
      stock: -1,
      image_url: ''
    });
    setEditingOffer(null);
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-violet-600">Cargando...</div>
      </div>
    );
  }

  const statusColors = {
    draft: 'bg-slate-100 text-slate-700',
    active: 'bg-emerald-100 text-emerald-700',
    paused: 'bg-yellow-100 text-yellow-700',
    ended: 'bg-red-100 text-red-700',
    inactive: 'bg-slate-100 text-slate-700',
    soldout: 'bg-red-100 text-red-700'
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-16 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Link to={createPageUrl('AdminDashboard')}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Campañas y Ofertas</h1>
                <p className="text-slate-500 text-sm">Gestiona promociones y recompensas</p>
              </div>
            </div>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="campaigns" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Campañas
              </TabsTrigger>
              <TabsTrigger value="offers" className="flex items-center gap-2">
                <Gift className="h-4 w-4" />
                Ofertas
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-6">
        {/* Campaigns Tab */}
        {tab === 'campaigns' && (
          <>
            <div className="flex justify-between items-center mb-6">
              <p className="text-slate-600">{campaigns?.length || 0} campañas</p>
              <Button 
                onClick={() => { resetCampaignForm(); setShowCampaignDialog(true); }}
                className="bg-violet-600 hover:bg-violet-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nueva Campaña
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {campaigns?.map((campaign, index) => (
                <motion.div
                  key={campaign.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="font-semibold text-slate-900">{campaign.name}</h3>
                          <p className="text-sm text-slate-500 mt-1">{campaign.description}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditCampaign(campaign)}>
                              <Edit className="h-4 w-4 mr-2" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => notifyCampaignMutation.mutate(campaign)}
                              disabled={notifyCampaignMutation.isPending}
                            >
                              <Send className="h-4 w-4 mr-2" /> Notificar usuarios
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => deleteCampaignMutation.mutate(campaign.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="flex items-center gap-2 mb-4">
                        <Badge className={statusColors[campaign.status]}>
                          {campaign.status === 'active' && <Play className="h-3 w-3 mr-1" />}
                          {campaign.status === 'paused' && <Pause className="h-3 w-3 mr-1" />}
                          {campaign.status}
                        </Badge>
                        <Badge variant="outline">
                          {campaign.type === 'multiplier' && `x${campaign.multiplier}`}
                          {campaign.type === 'bonus' && `+${campaign.bonus_points} pts`}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {campaign.start_date ? format(new Date(campaign.start_date), "d MMM", { locale: es }) : 'Sin fecha'}
                          {' - '}
                          {campaign.end_date ? format(new Date(campaign.end_date), "d MMM", { locale: es }) : 'Sin fecha'}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </>
        )}

        {/* Offers Tab */}
        {tab === 'offers' && (
          <>
            <div className="flex justify-between items-center mb-6">
              <p className="text-slate-600">{offers?.length || 0} ofertas</p>
              <Button 
                onClick={() => { resetOfferForm(); setShowOfferDialog(true); }}
                className="bg-violet-600 hover:bg-violet-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nueva Oferta
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {offers?.map((offer, index) => (
                <motion.div
                  key={offer.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="overflow-hidden">
                    {offer.image_url && (
                      <img src={offer.image_url} alt={offer.title} className="h-32 w-full object-cover" />
                    )}
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-slate-900 line-clamp-1">{offer.title}</h3>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditOffer(offer)}>
                              <Edit className="h-4 w-4 mr-2" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => notifyOfferMutation.mutate(offer)}
                              disabled={notifyOfferMutation.isPending}
                            >
                              <Send className="h-4 w-4 mr-2" /> Notificar usuarios
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => deleteOfferMutation.mutate(offer.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <p className="text-sm text-slate-500 line-clamp-2 mb-3">{offer.short_description}</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 text-violet-500" />
                          <span className="font-bold text-violet-600">{offer.points_cost.toLocaleString()}</span>
                        </div>
                        <Badge className={statusColors[offer.status]}>
                          {offer.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Campaign Dialog */}
      <Dialog open={showCampaignDialog} onOpenChange={(open) => { setShowCampaignDialog(open); if (!open) resetCampaignForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCampaign ? 'Editar Campaña' : 'Nueva Campaña'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveCampaignMutation.mutate(campaignForm); }} className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} required />
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
                <Input type="number" value={campaignForm.multiplier} onChange={(e) => setCampaignForm({ ...campaignForm, multiplier: parseFloat(e.target.value) })} min={1} step={0.5} />
              </div>
            )}
            {campaignForm.type === 'bonus' && (
              <div>
                <Label>Puntos bonus</Label>
                <Input type="number" value={campaignForm.bonus_points} onChange={(e) => setCampaignForm({ ...campaignForm, bonus_points: parseInt(e.target.value) })} min={0} />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCampaignDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveCampaignMutation.isPending}>
                {saveCampaignMutation.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Offer Dialog */}
      <Dialog open={showOfferDialog} onOpenChange={(open) => { setShowOfferDialog(open); if (!open) resetOfferForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingOffer ? 'Editar Oferta' : 'Nueva Oferta'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveOfferMutation.mutate(offerForm); }} className="space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <Label>Título</Label>
              <Input value={offerForm.title} onChange={(e) => setOfferForm({ ...offerForm, title: e.target.value })} required />
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
                <Input type="number" value={offerForm.points_cost} onChange={(e) => setOfferForm({ ...offerForm, points_cost: parseInt(e.target.value) })} min={1} />
              </div>
              <div>
                <Label>Valor en MXN</Label>
                <Input type="number" value={offerForm.value_mxn} onChange={(e) => setOfferForm({ ...offerForm, value_mxn: parseFloat(e.target.value) })} min={0} />
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
                <Input type="number" value={offerForm.stock} onChange={(e) => setOfferForm({ ...offerForm, stock: parseInt(e.target.value) })} min={-1} />
              </div>
            </div>
            <div>
              <Label>URL de imagen</Label>
              <Input value={offerForm.image_url} onChange={(e) => setOfferForm({ ...offerForm, image_url: e.target.value })} placeholder="https://..." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowOfferDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveOfferMutation.isPending}>
                {saveOfferMutation.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}