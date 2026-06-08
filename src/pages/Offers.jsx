import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
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
import { makeIdempotencyKey } from '@/lib/utils';
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

export default function Offers() {
  const [user, setUser] = useState(null);
  const [category, setCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [redeemStatus, setRedeemStatus] = useState(null); // 'success' | 'error' | null
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
    } catch (e) {
      base44.auth.redirectToLogin();
    }
  };

  // Fetch loyalty account
  const { data: accounts } = useQuery({
    queryKey: ['loyaltyAccount', user?.email],
    queryFn: () => base44.entities.LoyaltyAccount.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  const account = accounts?.[0];

  // Fetch all offers
  const { data: offers, isLoading } = useQuery({
    queryKey: ['allOffers'],
    queryFn: () => base44.entities.Offer.filter({ status: 'active' }, '-created_date', 50),
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

  // Redeem mutation
  const redeemMutation = useMutation({
    mutationFn: async (offer) => {
      // Generate confirmation code
      const confirmationCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      
      // Create redemption record
      const redemption = await base44.entities.Redemption.create({
        account_id: account.id,
        user_id: user.id,
        user_email: user.email,
        offer_id: offer.id,
        offer_title: offer.title,
        points_spent: offer.points_cost,
        value_mxn: offer.value_mxn,
        status: 'confirmed',
        confirmation_code: confirmationCode,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
      });

      // Generate idempotency key — redemption.id is unique per redemption,
      // so this is inherently idempotent (one redemption = one burn).
      const idempotencyKey = makeIdempotencyKey('burn', redemption.id);

      // Create ledger entry
      const newBalance = account.current_balance - offer.points_cost;
      await base44.entities.PointsLedger.create({
        account_id: account.id,
        user_id: user.id,
        type: 'BURN',
        points: -offer.points_cost,
        balance_after: newBalance,
        reference_type: 'redemption',
        reference_id: redemption.id,
        idempotency_key: idempotencyKey,
        description: `Canje: ${offer.title}`,
        status: 'completed'
      });

      // Update account balance
      await base44.entities.LoyaltyAccount.update(account.id, {
        current_balance: newBalance,
        lifetime_redeemed: (account.lifetime_redeemed || 0) + offer.points_cost,
        last_activity: new Date().toISOString()
      });

      // Update offer stock if limited
      if (offer.stock > 0) {
        await base44.entities.Offer.update(offer.id, {
          stock: offer.stock - 1,
          redemptions_count: (offer.redemptions_count || 0) + 1
        });
      }

      return { redemption, confirmationCode };
    },
    onSuccess: () => {
      setRedeemStatus('success');
      queryClient.invalidateQueries(['loyaltyAccount']);
      queryClient.invalidateQueries(['allOffers']);
    },
    onError: () => {
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
    if (account?.status === 'suspended') return;
    setSelectedOffer(offer);
    setRedeemStatus(null);
  };

  const confirmRedeem = () => {
    if (selectedOffer && account?.status !== 'suspended') {
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

  const isMerchant = user?.merchant_role === 'merchant' || user?.role === 'merchant';
  const isSuspended = isMerchant && account?.status === 'suspended';
  const showTrialBanner = isMerchant && account?.subscription_status === 'trial' && account?.trial_end_date;

  const categories = [
    { value: 'all', label: 'Todas' },
    { value: 'food', label: '🍽️ Comida' },
    { value: 'shopping', label: '🛍️ Compras' },
    { value: 'travel', label: '✈️ Viajes' },
    { value: 'entertainment', label: '🎬 Diversión' },
    { value: 'services', label: '🔧 Servicios' },
  ];

  return (
    <div className="min-h-screen pb-24 md:pb-8 bg-slate-50">
      {isSuspended && <SuspendedAccountModal />}
      {!isSuspended && showTrialBanner && (
        <div className="fixed top-16 left-0 right-0 z-40">
          <TrialBanner trialEndDate={account?.trial_end_date} />
        </div>
      )}
      
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-pink-600 px-4 pt-4 pb-20">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Link to={createPageUrl('Home')}>
              <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/10">
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
        <div className="bg-white rounded-2xl p-4 shadow-lg mb-6">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar ofertas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-50 border-0"
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
              <h2 className="text-lg font-bold text-slate-900">Recomendado para ti</h2>
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
          <h2 className="text-lg font-bold text-slate-900">
            {category === 'all' ? 'Todas las ofertas' : categories.find(c => c.value === category)?.label}
          </h2>
          <p className="text-sm text-slate-500">{filteredOffers.length} disponibles</p>
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
            <Gift className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No hay ofertas</p>
            <p className="text-slate-400 text-sm mt-1">
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
              <h3 className="text-xl font-bold text-slate-900 mb-2">¡Canje exitoso!</h3>
              <p className="text-slate-500 mb-4">
                Tu código de confirmación es:
              </p>
              <div className="bg-slate-100 rounded-xl px-6 py-3 font-mono text-lg font-bold text-violet-600">
                {redeemMutation.data?.confirmationCode}
              </div>
              <p className="text-sm text-slate-400 mt-4">
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
              <h3 className="text-xl font-bold text-slate-900 mb-2">Error al canjear</h3>
              <p className="text-slate-500 mb-4">
                Hubo un problema procesando tu canje. Por favor intenta de nuevo.
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
                    <h4 className="font-semibold text-slate-900">{selectedOffer.title}</h4>
                    <p className="text-sm text-slate-500 mt-1">{selectedOffer.short_description}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <Star className="h-4 w-4 text-violet-500" />
                      <span className="font-bold text-violet-600">
                        {selectedOffer.points_cost.toLocaleString()} puntos
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-4 bg-slate-50 rounded-xl">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-500">Tu saldo actual</span>
                    <span className="font-medium">{account?.current_balance?.toLocaleString()} pts</span>
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-500">Costo del canje</span>
                    <span className="font-medium text-red-500">-{selectedOffer.points_cost.toLocaleString()} pts</span>
                  </div>
                  <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between">
                    <span className="font-medium text-slate-700">Saldo después</span>
                    <span className="font-bold text-violet-600">
                      {((account?.current_balance || 0) - selectedOffer.points_cost).toLocaleString()} pts
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