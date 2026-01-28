import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  QrCode, 
  Gift, 
  History, 
  TrendingUp, 
  Sparkles,
  ChevronRight,
  Bell,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PointsCard from '../components/loyalty/PointsCard';
import TransactionItem from '../components/loyalty/TransactionItem';
import OfferCard from '../components/loyalty/OfferCard';
import NotificationsPanel from '../components/loyalty/NotificationsPanel';
import TrialBanner from '../components/loyalty/TrialBanner';
import WelcomeTrialDialog from '../components/loyalty/WelcomeTrialDialog';
import SuspendedAccountModal from '../components/loyalty/SuspendedAccountModal';

export default function Home() {
  const [user, setUser] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

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
  const { data: accounts, isLoading: loadingAccount } = useQuery({
    queryKey: ['loyaltyAccount', user?.email],
    queryFn: () => base44.entities.LoyaltyAccount.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });

  const account = accounts?.[0];

  // Fetch recent transactions
  const { data: transactions, isLoading: loadingTransactions } = useQuery({
    queryKey: ['recentTransactions', account?.id],
    queryFn: () => base44.entities.PointsLedger.filter(
      { account_id: account?.id }, 
      '-created_date', 
      5
    ),
    enabled: !!account?.id,
  });

  // Fetch featured offers
  const { data: offers, isLoading: loadingOffers } = useQuery({
    queryKey: ['featuredOffers'],
    queryFn: () => base44.entities.Offer.filter({ status: 'active' }, '-created_date', 4),
  });

  // Build notifications from recent activity
  const notifications = React.useMemo(() => {
    if (!transactions) return [];
    
    return transactions.map(tx => {
      let title = '';
      let message = '';
      let type = '';

      switch (tx.type) {
        case 'EARN':
          title = '¡Ganaste puntos!';
          message = `+${tx.points} puntos en ${tx.store_name || 'tu compra'}`;
          type = 'earn';
          break;
        case 'BURN':
          title = 'Puntos canjeados';
          message = `Usaste ${Math.abs(tx.points)} puntos`;
          type = 'burn';
          break;
        case 'BONUS':
          title = '¡Bonus especial!';
          message = `+${tx.points} puntos de campaña`;
          type = 'campaign';
          break;
        default:
          title = 'Movimiento de puntos';
          message = `${tx.points > 0 ? '+' : ''}${tx.points} puntos`;
          type = 'default';
      }

      return {
        id: tx.id,
        title,
        message,
        type,
        created_date: tx.created_date,
        read: false
      };
    }).slice(0, 10);
  }, [transactions]);

  // Create account if doesn't exist
  useEffect(() => {
    const initAccount = async () => {
      if (user && accounts && accounts.length === 0) {
        // Generate initial QR token
        const qrToken = Math.random().toString(36).substring(2, 14).toUpperCase();
        const tokenExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        
        // Check if user is merchant
        const isMerchantUser = user.merchant_role === 'merchant' || user.role === 'merchant';
        
        // Only merchants get trial period, regular customers get active status
        const trialStart = isMerchantUser ? new Date().toISOString() : null;
        const trialEnd = isMerchantUser ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;
        
        await base44.entities.LoyaltyAccount.create({
          user_id: user.id,
          user_email: user.email,
          user_name: user.full_name || user.email.split('@')[0],
          status: 'active',
          tier: 'bronze',
          current_balance: 0,
          lifetime_earned: 0,
          lifetime_redeemed: 0,
          qr_token: qrToken,
          qr_token_expires: tokenExpires,
          last_activity: new Date().toISOString(),
          subscription_status: isMerchantUser ? 'trial' : 'active',
          trial_start_date: trialStart,
          trial_end_date: trialEnd,
          subscription_plan: isMerchantUser ? 'trial' : 'monthly',
          welcome_message_shown: false
        });

        // Send notification to admin about new merchant
        if (isMerchantUser) {
          try {
            await base44.integrations.Core.SendEmail({
              to: 'jose.herrera@acaciaco.com.mx',
              from_name: 'Puntos+ Sistema',
              subject: '🆕 Nuevo comercio dado de alta en Puntos+',
              body: `
                <h2>Se acaba de dar de alta un nuevo comercio</h2>
                <p><strong>Nombre:</strong> ${user.full_name || 'No especificado'}</p>
                <p><strong>Email:</strong> ${user.email}</p>
                <p><strong>Fecha de registro:</strong> ${new Date().toLocaleString('es-MX')}</p>
                <p><strong>Trial hasta:</strong> ${new Date(trialEnd).toLocaleString('es-MX')}</p>
                <hr>
                <p>Por favor, dar de alta en la app de billing para gestionar su suscripción.</p>
              `
            });
          } catch (e) {
            console.error('Error sending admin notification:', e);
          }
        }
      }
    };
    initAccount();
  }, [user, accounts]);

  // Show welcome dialog on first login
  useEffect(() => {
    if (account && !account.welcome_message_shown) {
      setShowWelcome(true);
    }
  }, [account]);

  const handleCloseWelcome = async () => {
    setShowWelcome(false);
    if (account) {
      await base44.entities.LoyaltyAccount.update(account.id, {
        welcome_message_shown: true
      });
    }
  };

  // Subscribe to real-time updates
  useEffect(() => {
    if (!account?.id) return;

    const unsubscribe = base44.entities.PointsLedger.subscribe((event) => {
      if (event.data?.account_id === account.id) {
        // Refetch data on new transaction
        window.location.reload();
      }
    });

    return () => unsubscribe();
  }, [account?.id]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-violet-600">Cargando...</div>
      </div>
    );
  }

  // Calculate days remaining for trial
  const daysRemaining = account?.trial_end_date 
    ? Math.ceil((new Date(account.trial_end_date) - new Date()) / (1000 * 60 * 60 * 24))
    : 30;

  const quickActions = [
    { 
      icon: QrCode, 
      label: 'Mi QR', 
      description: 'Muestra tu código',
      page: 'Wallet',
      color: 'from-violet-500 to-purple-600',
      shadow: 'shadow-violet-500/25'
    },
    { 
      icon: Gift, 
      label: 'Canjear', 
      description: 'Ver ofertas',
      page: 'Offers',
      color: 'from-pink-500 to-rose-600',
      shadow: 'shadow-pink-500/25'
    },
    { 
      icon: History, 
      label: 'Historial', 
      description: 'Mis movimientos',
      page: 'History',
      color: 'from-blue-500 to-cyan-600',
      shadow: 'shadow-blue-500/25'
    },
  ];

  // Check if account is suspended (only for merchant accounts, not regular customers)
  const isMerchant = user?.merchant_role === 'merchant' || user?.role === 'merchant';
  const isSuspended = isMerchant && (account?.status === 'suspended' || 
    (account?.subscription_status === 'inactive' && account?.status === 'suspended'));

  return (
    <div className="pb-24 md:pb-8">
      {/* Suspended Account Modal */}
      {isSuspended && <SuspendedAccountModal />}

      {/* Trial Banner */}
      {!isSuspended && <TrialBanner trialEndDate={account?.trial_end_date} />}

      {/* Welcome Dialog */}
      <WelcomeTrialDialog
        isOpen={showWelcome}
        onClose={handleCloseWelcome}
        userName={user?.full_name}
        daysRemaining={daysRemaining}
      />

      {/* Notifications Panel */}
      <NotificationsPanel 
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        notifications={notifications}
      />

      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-purple-600 to-pink-600" />
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.3'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }} />
        
        <div className="relative px-4 pt-8 pb-16">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-lg mx-auto"
          >
            {/* Greeting */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-white/80 text-sm">
                  {new Date().getHours() < 12 ? '¡Buenos días!' : 
                   new Date().getHours() < 18 ? '¡Buenas tardes!' : '¡Buenas noches!'}
                </p>
                <h1 className="text-2xl font-bold text-white">
                  {user.full_name || 'Hola'}
                </h1>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-white/80 hover:text-white hover:bg-white/10 relative"
                onClick={() => setShowNotifications(true)}
              >
                <Bell className="h-5 w-5" />
                {notifications?.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
                    {notifications.length}
                  </span>
                )}
              </Button>
            </div>

            {/* Points Card */}
            {loadingAccount ? (
              <Skeleton className="h-48 rounded-3xl" />
            ) : account ? (
              <PointsCard account={account} />
            ) : (
              <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-6 text-center text-white">
                <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">Creando tu cuenta...</p>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 -mt-6 max-w-lg mx-auto space-y-6 relative z-10">
        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-3 relative z-10"
        >
          {quickActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <Link key={action.page} to={createPageUrl(action.page)}>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`bg-gradient-to-br ${action.color} rounded-2xl p-4 text-white shadow-xl ${action.shadow}`}
                >
                  <Icon className="h-6 w-6 mb-2" />
                  <p className="font-semibold text-sm">{action.label}</p>
                  <p className="text-[10px] text-white/70">{action.description}</p>
                </motion.div>
              </Link>
            );
          })}
        </motion.div>

        {/* Promo Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative overflow-hidden bg-gradient-to-r from-amber-400 to-orange-500 rounded-2xl p-4"
        >
          <div className="relative z-10 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-white">¡Puntos x2 este fin!</p>
              <p className="text-xs text-white/80">En todas tus compras</p>
            </div>
            <ChevronRight className="h-5 w-5 text-white/60" />
          </div>
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Actividad reciente</h2>
            <Link 
              to={createPageUrl('History')}
              className="text-sm text-violet-600 hover:text-violet-700 font-medium"
            >
              Ver todo
            </Link>
          </div>

          {loadingTransactions ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-2xl" />
              ))}
            </div>
          ) : transactions?.length > 0 ? (
            <div className="space-y-3">
              {transactions.slice(0, 3).map((tx, index) => (
                <TransactionItem key={tx.id} transaction={tx} index={index} />
              ))}
            </div>
          ) : (
            <div className="bg-slate-50 rounded-2xl p-8 text-center">
              <History className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Aún no tienes movimientos</p>
              <p className="text-slate-400 text-xs mt-1">
                Realiza tu primera compra para acumular puntos
              </p>
            </div>
          )}
        </motion.div>

        {/* Featured Offers */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">Ofertas destacadas</h2>
            <Link 
              to={createPageUrl('Offers')}
              className="text-sm text-violet-600 hover:text-violet-700 font-medium"
            >
              Ver todas
            </Link>
          </div>

          {loadingOffers ? (
            <div className="grid grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-64 rounded-2xl" />
              ))}
            </div>
          ) : offers?.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {offers.slice(0, 2).map((offer, index) => (
                <OfferCard 
                  key={offer.id} 
                  offer={offer} 
                  userBalance={account?.current_balance || 0}
                  index={index}
                />
              ))}
            </div>
          ) : (
            <div className="bg-slate-50 rounded-2xl p-8 text-center">
              <Gift className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Próximamente más ofertas</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}