import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Button } from '@/components/ui/button';
import PointsCard from '../components/loyalty/PointsCard';
import QRWallet from '../components/loyalty/QRWallet';
import TransactionItem from '../components/loyalty/TransactionItem';
import SuspendedAccountModal from '../components/loyalty/SuspendedAccountModal';
import TrialBanner from '../components/loyalty/TrialBanner';

export default function Wallet() {
  const [user, setUser] = useState(null);
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
  const { data: accounts, isLoading } = useQuery({
    queryKey: ['loyaltyAccount', user?.email],
    queryFn: () => base44.entities.LoyaltyAccount.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  const account = accounts?.[0];

  // Fetch recent transactions
  const { data: transactions } = useQuery({
    queryKey: ['recentTransactions', account?.id],
    queryFn: () => base44.entities.PointsLedger.filter(
      { account_id: account?.id }, 
      '-created_date', 
      5
    ),
    enabled: !!account?.id,
  });

  // Mutation to refresh QR token
  const refreshTokenMutation = useMutation({
    mutationFn: async () => {
      if (!account?.id) throw new Error('Cuenta no disponible');
      const array = new Uint8Array(9);
      crypto.getRandomValues(array);
      const newToken = Array.from(array, b => b.toString(36).padStart(2, '0')).join('').substring(0, 12).toUpperCase();
      const tokenExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      
      await base44.entities.LoyaltyAccount.update(account.id, {
        qr_token: newToken,
        qr_token_expires: tokenExpires
      });
      
      return { qr_token: newToken, qr_token_expires: tokenExpires };
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['loyaltyAccount']);
    },
    onError: () => {
      toast.error('No se pudo actualizar el código QR. Intenta de nuevo.');
    }
  });

  // Real-time subscription for balance updates
  useEffect(() => {
    if (!account?.id) return;

    const unsubscribe = base44.entities.LoyaltyAccount.subscribe((event) => {
      if (event.data?.id === account.id) {
        queryClient.invalidateQueries(['loyaltyAccount']);
      }
    });

    return () => unsubscribe();
  }, [account?.id, queryClient]);

  if (!user || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-violet-600">Cargando...</div>
      </div>
    );
  }

  const isMerchant = user?.merchant_role === 'merchant' || user?.role === 'merchant';
  const isSuspended = isMerchant && account?.status === 'suspended';
  const showTrialBanner = isMerchant && account?.subscription_status === 'trial' && account?.trial_end_date;

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      {isSuspended && <SuspendedAccountModal />}
      {!isSuspended && showTrialBanner && (
        <div className="fixed top-16 left-0 right-0 z-40">
          <TrialBanner trialEndDate={account?.trial_end_date} />
        </div>
      )}
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-pink-600 px-4 pt-4 pb-32">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Link to={createPageUrl('Home')} aria-label="Volver al inicio">
              <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/10" tabIndex={-1}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white">Mi Wallet</h1>
              <p className="text-white/70 text-sm">Tu código QR y saldo</p>
            </div>
          </div>

          {/* Points Summary */}
          {account && <PointsCard account={account} compact />}
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 -mt-20 max-w-lg mx-auto space-y-6">
        {/* QR Code Card */}
        {account && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <QRWallet 
              account={account} 
              onRefreshToken={() => refreshTokenMutation.mutateAsync()}
            />
          </motion.div>
        )}

        {/* How it works */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100"
        >
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            ¿Cómo funciona?
          </h3>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-sm">
                1
              </div>
              <div>
                <p className="font-medium text-slate-900">Muestra tu QR</p>
                <p className="text-sm text-slate-500">
                  Al momento de pagar, muestra este código al cajero
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-sm">
                2
              </div>
              <div>
                <p className="font-medium text-slate-900">Acumula puntos</p>
                <p className="text-sm text-slate-500">
                  Gana 1 punto por cada $10 MXN de compra
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-sm">
                3
              </div>
              <div>
                <p className="font-medium text-slate-900">Canjea premios</p>
                <p className="text-sm text-slate-500">
                  Usa tus puntos en ofertas y descuentos exclusivos
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Recent Transactions */}
        {transactions?.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Últimos movimientos</h3>
              <Link 
                to={createPageUrl('History')}
                className="text-sm text-violet-600 font-medium"
              >
                Ver todo
              </Link>
            </div>
            <div className="space-y-3">
              {transactions.slice(0, 3).map((tx, index) => (
                <TransactionItem key={tx.id} transaction={tx} index={index} />
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}