import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { isStaff } from '@/lib/rbac';
import { useTenant } from '@/lib/useTenant';
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
import { goToLogin } from '@/lib/goToLogin';

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
      goToLogin();
    }
  };

  // Fetch loyalty account
  const { data: accounts, isLoading } = useQuery({
    queryKey: ['loyaltyAccount', user?.email],
    queryFn: () => base44.entities.LoyaltyAccount.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  const account = accounts?.[0];
  const { business, license } = useTenant(user);

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

  // Mutation to refresh QR token — routed through a service-role function
  // (module 14 follow-up, 2026-08-24) since qr_token/qr_token_expires are
  // no longer client-writable at the field level. See refreshQrToken/entry.ts.
  const refreshTokenMutation = useMutation({
    mutationFn: async () => {
      if (!account?.id) throw new Error('Cuenta no disponible');
      const response = await base44.functions.invoke('refreshQrToken', {});
      const result = response?.data;
      if (!result?.success) {
        throw new Error(result?.error || 'No se pudo actualizar el código QR');
      }
      return { qr_token: result.qr_token, qr_token_expires: result.qr_token_expires };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyaltyAccount'] });
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
        queryClient.invalidateQueries({ queryKey: ['loyaltyAccount'] });
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

  const isMerchant = isStaff(user);
  const isSuspended = isMerchant && license.isSuspended;
  const showTrialBanner = isMerchant && license.isTrial && business?.trial_end_at;

  return (
    <div className="min-h-screen pb-24 md:pb-8">
      {isSuspended && <SuspendedAccountModal />}
      {!isSuspended && showTrialBanner && (
        <TrialBanner trialEndDate={business?.trial_end_at} />
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
          className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-800"
        >
          <h3 className="font-semibold text-slate-900 dark:text-slate-50 mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
            ¿Cómo funciona?
          </h3>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-sm">
                1
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-50">Muestra tu QR</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Al momento de pagar, muestra este código al cajero
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-sm">
                2
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-50">Acumula puntos</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Gana 1 punto por cada $10 MXN de compra
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-sm">
                3
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-50">Canjea premios</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
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
              <h3 className="font-semibold text-slate-900 dark:text-slate-50">Últimos movimientos</h3>
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