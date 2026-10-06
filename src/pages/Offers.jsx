import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { isStaff } from '@/lib/rbac';
import { useTenant } from '@/lib/useTenant';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Sparkles,
  Gift,
  Search,
  Star,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import OfferCard from '../components/loyalty/OfferCard';
import SuspendedAccountModal from '../components/loyalty/SuspendedAccountModal';
import TrialBanner from '../components/loyalty/TrialBanner';
import { goToLogin } from '@/lib/goToLogin';

export default function Offers() {
  const [user, setUser] = useState(null);
  const [category, setCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [redeemStatus, setRedeemStatus] = useState(null); // 'success' | 'error' | null
  const [redeemError, setRedeemError] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const raw = await base44.auth.me();
      // Base44 stores custom fields (business_id, etc.) under `data`; flatten so
      // the tenant scope below can read user.business_id (see Onboarding.jsx /
      // MerchantPOS.jsx for the same pattern).
      const userData = raw?.data ? { ...raw.data, ...raw } : raw;
      setUser(userData);
    } catch (e) {
      goToLogin();
    }
  };

  // Fetch loyalty account
  const { data: accounts } = useQuery({
    queryKey: ['loyaltyAccount', user?.email],
    queryFn: () => base44.entities.LoyaltyAccount.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  const account = accounts?.[0];
  const { business, license } = useTenant(user);

  // Fetch all offers
  // Client-side tenant scope (defense in depth): the RLS `read` rule's
  // unscoped `{status:'active'}` branch means an omitted business_id here
  // would return every tenant's active offers, not just this user's. Legacy
  // customer accounts without a business_id fall back to the pre-fix
  // (unscoped) behavior rather than seeing zero offers.
  const { data: offers, isLoading } = useQuery({
    queryKey: ['allOffers', user?.business_id],
    queryFn: () => base44.entities.Offer.filter({ status: 'active', business_id: user?.business_id }, '-created_date', 50),
    enabled: !!user,
  });

  // AI Recommendations
  const { data: recommendations } = useQuery({
    queryKey: ['recommendations', account?.id],
    queryFn: async () => {
      if (!account || !offers) return [];
      
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Eres un sistema de recomendaciones de un programa de lealtad.
        
Usuario: Balance ${account.current_balance} puntos, Nivel ${account.tier}
Total ganado históricamente: ${account.lifetime_earned}
Total canjeado: ${account.lifetime_redeemed}

Ofertas disponibles (JSON):
${JSON.stringify(offers.slice(0, 10).map(o => ({
  id: o.id,
  title: o.title,
  points_cost: o.points_cost,
  category: o.category,
  value_mxn: o.value_mxn
})), null, 2)}

Selecciona las 3 mejores ofertas para este usuario y explica por qué en español.
Considera: que pueda pagar con sus puntos, variedad de categorías, mejor valor.`,
        response_json_schema: {
          type: "object",
          properties: {
            recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  offer_id: { type: "string" },
                  reason: { type: "string" }
                }
              }
            }
          }
        }
      });

      return response.recommendations || [];
    },
    enabled: !!account && !!offers && offers.length > 0,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Redeem mutation — runs server-side so the balance is validated and
  // deducted by a service-role function (the client cannot write the balance).
  const redeemMutation = useMutation({
    mutationFn: async (offer) => {
      const response = await base44.functions.invoke('redeemOffer', {
        offer_id: offer.id,
        request_id: crypto.randomUUID(),
      });
      const result = response?.data;
      if (!result?.success) {
        throw new Error(result?.error || 'No se pudo canjear la oferta');
      }
      return { confirmationCode: result.confirmation_code, redemption: result.redemption };
    },
    onSuccess: () => {
      setRedeemStatus('success');
      queryClient.invalidateQueries({ queryKey: ['loyaltyAccount'] });
      queryClient.invalidateQueries({ queryKey: ['allOffers'] });
    },
    onError: (error) => {
      setRedeemError(error?.message || '');
      setRedeemStatus('error');
    }
  });

  // Filter offers
  const filteredOffers = React.useMemo(() => {
    if (!offers) return [];
    
    let filtered = [...offers];

    if (category !== 'all') {
      filtered = filtered.filter(o => o.category === category);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(o => 
        o.title.toLowerCase().includes(query) ||
        o.description?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [offers, category, searchQuery]);

  // Get recommended offers
  const recommendedOffers = React.useMemo(() => {
    if (!recommendations || !offers) return [];
    
    return recommendations.map(rec => {
      const offer = offers.find(o => o.id === rec.offer_id);
      return offer ? { ...offer, recommendationReason: rec.reason } : null;
    }).filter(Boolean);
  }, [recommendations, offers]);

  const handleRedeem = (offer) => {
    if (license.isSuspended) return;
    setSelectedOffer(offer);
    setRedeemStatus(null);
    setRedeemError('');
  };

  const confirmRedeem = () => {
    if (selectedOffer && !license.isSuspended) {
      redeemMutation.mutate(selectedOffer);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-violet-600">Cargando...</div>
      </div>
    );
  }

  const isMerchant = isStaff(user);
  const isSuspended = isMerchant && license.isSuspended;
  const showTrialBanner = isMerchant && license.isTrial && business?.trial_end_at;

  const categories = [
    { value: 'all', label: 'Todas' },
    { value: 'food', label: '🍽️ Comida' },
    { value: 'shopping', label: '🛍️ Compras' },
    { value: 'travel', label: '✈️ Viajes' },
    { value: 'entertainment', label: '🎬 Diversión' },
    { value: 'services', label: '🔧 Servicios' },
  ];

  return (
    <div className="min-h-screen pb-24 md:pb-8 bg-slate-50 dark:bg-slate-900">
      {isSuspended && <SuspendedAccountModal />}
      {!isSuspended && showTrialBanner && (
        <TrialBanner trialEndDate={business?.trial_end_at} />
      )}
      
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-pink-600 px-4 pt-4 pb-20">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Link to={createPageUrl('Home')} aria-label="Volver al inicio">
              <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/10" tabIndex={-1}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white">Ofertas</h1>
              <p className="text-white/70 text-sm">Canjea tus puntos</p>
            </div>
          </div>

          {/* Balance Pill */}
          <div className="flex items-center justify-between bg-white/10 backdrop-blur-sm rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Star className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-white/70 text-xs">Mi saldo</p>
                <p className="text-white text-xl font-bold">
                  {account?.current_balance?.toLocaleString() || 0}
                </p>
              </div>
            </div>
            <Link to={createPageUrl('Wallet')}>
              <Button variant="secondary" size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0">
                Ver wallet
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 -mt-8">
        {/* Search & Filters */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-lg mb-6">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <Input
              placeholder="Buscar ofertas..."
              aria-label="Buscar ofertas"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-50 dark:bg-slate-900 border-0"
            />
          </div>
          
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <Button
                key={cat.value}
                variant={category === cat.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCategory(cat.value)}
                className={category === cat.value 
                  ? 'bg-violet-600 hover:bg-violet-700 text-white whitespace-nowrap' 
                  : 'whitespace-nowrap'
                }
              >
                {cat.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Recommended Section */}
        {recommendedOffers.length > 0 && category === 'all' && !searchQuery && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-violet-600" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Recomendado para ti</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendedOffers.map((offer, index) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  userBalance={account?.current_balance || 0}
                  onRedeem={handleRedeem}
                  index={index}
                  isRecommended
                  recommendationReason={offer.recommendationReason}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* All Offers */}
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
            {category === 'all' ? 'Todas las ofertas' : categories.find(c => c.value === category)?.label}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{filteredOffers.length} disponibles</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        ) : filteredOffers.length > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            {filteredOffers.map((offer, index) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                userBalance={account?.current_balance || 0}
                onRedeem={handleRedeem}
                index={index}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Gift className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">No hay ofertas</p>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
              {searchQuery ? 'Intenta otra búsqueda' : 'Próximamente más ofertas'}
            </p>
          </div>
        )}
      </div>

      {/* Redeem Dialog */}
      <Dialog open={!!selectedOffer} onOpenChange={(open) => !open && setSelectedOffer(null)}>
        <DialogContent className="sm:max-w-md">
          {redeemStatus === 'success' ? (
            <div className="text-center py-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle className="h-8 w-8 text-emerald-600" />
              </motion.div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-2">¡Canje exitoso!</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-4">
                Tu código de confirmación es:
              </p>
              <div className="bg-slate-100 dark:bg-slate-800 rounded-xl px-6 py-3 font-mono text-lg font-bold text-violet-600">
                {redeemMutation.data?.confirmationCode}
              </div>
              <p className="text-sm text-slate-400 dark:text-slate-500 mt-4">
                Muestra este código al momento de usar tu beneficio
              </p>
              <Button 
                onClick={() => setSelectedOffer(null)} 
                className="mt-6 w-full bg-violet-600 hover:bg-violet-700"
              >
                Entendido
              </Button>
            </div>
          ) : redeemStatus === 'error' ? (
            <div className="text-center py-6">
              <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-2">Error al canjear</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-4">
                {redeemError || 'Hubo un problema procesando tu canje. Por favor intenta de nuevo.'}
              </p>
              <Button 
                onClick={() => setRedeemStatus(null)} 
                className="w-full"
              >
                Reintentar
              </Button>
            </div>
          ) : selectedOffer && (
            <>
              <DialogHeader>
                <DialogTitle>Confirmar canje</DialogTitle>
                <DialogDescription>
                  ¿Estás seguro que deseas canjear esta oferta?
                </DialogDescription>
              </DialogHeader>
              
              <div className="py-4">
                <div className="flex gap-4">
                  {selectedOffer.image_url ? (
                    <img 
                      src={selectedOffer.image_url} 
                      alt={selectedOffer.title}
                      className="w-20 h-20 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-violet-100 flex items-center justify-center">
                      <Gift className="h-8 w-8 text-violet-400" />
                    </div>
                  )}
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900 dark:text-slate-50">{selectedOffer.title}</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{selectedOffer.short_description}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <Star className="h-4 w-4 text-violet-500" />
                      <span className="font-bold text-violet-600">
                        {(selectedOffer.points_cost || 0).toLocaleString()} puntos
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-500 dark:text-slate-400">Tu saldo actual</span>
                    <span className="font-medium">{(account?.current_balance || 0).toLocaleString()} pts</span>
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-500 dark:text-slate-400">Costo del canje</span>
                    <span className="font-medium text-red-500">-{(selectedOffer.points_cost || 0).toLocaleString()} pts</span>
                  </div>
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-2 mt-2 flex justify-between">
                    <span className="font-medium text-slate-700 dark:text-slate-200">Saldo después</span>
                    <span className="font-bold text-violet-600">
                      {((account?.current_balance || 0) - (selectedOffer.points_cost || 0)).toLocaleString()} pts
                    </span>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setSelectedOffer(null)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={confirmRedeem}
                  disabled={redeemMutation.isPending}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  {redeemMutation.isPending ? 'Procesando...' : 'Confirmar canje'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}