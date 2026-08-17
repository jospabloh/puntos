import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Store,
  Search,
  Plus,
  Minus,
  CheckCircle,
  AlertCircle,
  User,
  DollarSign,
  Ticket,
  ArrowLeft,
  Gift,
  History,
  Loader2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { getActiveBusinessId } from '@/lib/activeTenant';
import { isStaff } from '@/lib/rbac';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import TrialBanner from '../components/loyalty/TrialBanner';
import WelcomeTrialDialog from '../components/loyalty/WelcomeTrialDialog';

export default function MerchantPOS() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('earn');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [earnAmount, setEarnAmount] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [burnPoints, setBurnPoints] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [showResult, setShowResult] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const raw = await base44.auth.me();
      const userData = raw?.data ? { ...raw.data, ...raw } : raw;
      // POS is for the platform owner, business admins, and staff/cashiers.
      const allowed = ['admin', 'business_admin', 'merchant'].includes(userData.role) || userData.merchant_role === 'merchant';
      if (!allowed) {
        window.location.href = createPageUrl('Home');
        return;
      }
      setUser(userData);
    } catch (e) {
      base44.auth.redirectToLogin();
    }
  };

  // Fetch active stores. The platform owner sees all; a tenant admin sees their
  // whole business; staff/cashiers are pinned to the single store they were
  // assigned (G-1). The server functions enforce this too — this filter is just
  // so the operator never sees a store they cannot transact in.
  const { data: stores } = useQuery({
    queryKey: ['stores', getActiveBusinessId(user), user?.role, user?.store_id || user?.storeId],
    queryFn: async () => {
      const all = await base44.entities.Store.filter({
        status: 'active',
        business_id: getActiveBusinessId(user),
      });
      if (isStaff(user)) {
        const assigned = user.store_id || user.storeId;
        return all.filter((s) => s.id === assigned);
      }
      return all;
    },
    enabled: !!user,
  });

  // Set default store
  useEffect(() => {
    if (stores?.length > 0 && !selectedStore) {
      setSelectedStore(stores[0]);
    }
  }, [stores, selectedStore]);

  // Search customers - ONLY from merchant's store
  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ['searchCustomers', customerSearch, selectedStore?.id],
    queryFn: async () => {
      if (customerSearch.length < 3 || !selectedStore) return [];
      
      // Search by email or QR token - ONLY for customers of this store
      const byEmail = await base44.entities.LoyaltyAccount.filter(
        { 
          user_email: customerSearch,
          store_id: selectedStore.id  // SECURITY: Only customers from this store
        },
        '-created_date',
        10
      );
      
      if (byEmail.length > 0) return byEmail;

      // Search by QR token (exact match) - ONLY for customers of this store
      const byToken = await base44.entities.LoyaltyAccount.filter(
        { 
          qr_token: customerSearch.toUpperCase(),
          store_id: selectedStore.id  // SECURITY: Only customers from this store
        }
      );
      
      return byToken;
    },
    enabled: customerSearch.length >= 3 && !!selectedStore,
  });

  // Recent transactions for this store
  const { data: recentTransactions } = useQuery({
    queryKey: ['storeTransactions', selectedStore?.id],
    queryFn: () => base44.entities.PointsLedger.filter(
      { store_id: selectedStore?.id },
      '-created_date',
      20
    ),
    enabled: !!selectedStore?.id,
  });

  // Earn points mutation — runs server-side. The points formula and the balance
  // write happen in the earnPoints service-role function so the client cannot
  // forge a balance (G-2). The browser only sends store, account and amount.
  const earnMutation = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(earnAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Monto inválido');
      }
      if (!selectedStore || !selectedCustomer) {
        throw new Error('Selecciona una tienda y un cliente');
      }

      const response = await base44.functions.invoke('earnPoints', {
        store_id: selectedStore.id,
        account_id: selectedCustomer.id,
        amount,
        ticket_id: ticketId || undefined,
        request_id: crypto.randomUUID(),
      });
      const result = response?.data;
      if (!result?.success) {
        throw new Error(result?.error || 'No se pudo procesar la transacción');
      }
      return { pointsEarned: result.points_earned, newBalance: result.new_balance, amount: result.amount };
    },
    onSuccess: (data) => {
      setShowResult({ type: 'success', data, action: 'earn' });
      setEarnAmount('');
      setTicketId('');
      setSelectedCustomer(null);
      setCustomerSearch('');
      queryClient.invalidateQueries({ queryKey: ['storeTransactions'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Error al procesar la transacción');
    }
  });

  // Burn points mutation — runs server-side. The balance check and deduction
  // happen in the burnPoints service-role function (G-2).
  const burnMutation = useMutation({
    mutationFn: async () => {
      const points = parseInt(burnPoints);
      if (isNaN(points) || points < 1) {
        throw new Error('Cantidad de puntos inválida');
      }
      if (!selectedStore || !selectedCustomer) {
        throw new Error('Selecciona una tienda y un cliente');
      }

      const response = await base44.functions.invoke('burnPoints', {
        store_id: selectedStore.id,
        account_id: selectedCustomer.id,
        points,
        request_id: crypto.randomUUID(),
      });
      const result = response?.data;
      if (!result?.success) {
        throw new Error(result?.error || 'No se pudo procesar el canje');
      }
      return { pointsBurned: result.points_burned, newBalance: result.new_balance };
    },
    onSuccess: (data) => {
      setShowResult({ type: 'success', data, action: 'burn' });
      setBurnPoints('');
      setSelectedCustomer(null);
      setCustomerSearch('');
      queryClient.invalidateQueries({ queryKey: ['storeTransactions'] });
    },
    onError: (error) => {
      toast.error(error.message || 'Error al procesar el canje');
    }
  });

  // Fetch loyalty account to check trial status
  const { data: merchantAccounts } = useQuery({
    queryKey: ['merchantAccount', user?.email],
    queryFn: () => base44.entities.LoyaltyAccount.filter({ user_email: user?.email }),
    enabled: !!user?.email,
  });
  
  const merchantAccount = merchantAccounts?.[0];
  const showTrialBanner = merchantAccount?.subscription_status === 'trial' && merchantAccount?.trial_end_date;
  
  // Calculate days remaining
  const daysRemaining = merchantAccount?.trial_end_date 
    ? Math.ceil((new Date(merchantAccount.trial_end_date) - new Date()) / (1000 * 60 * 60 * 24))
    : 30;

  // Show welcome dialog for trial merchants (only once - first time)
  useEffect(() => {
    const isInTrial = merchantAccount?.subscription_status === 'trial' && merchantAccount?.trial_end_date;
    const hasNotSeenWelcome = merchantAccount && !merchantAccount.welcome_message_shown;
    
    if (isInTrial && hasNotSeenWelcome) {
      setShowWelcome(true);
    }
  }, [merchantAccount]);

  const handleCloseWelcome = async () => {
    setShowWelcome(false);
    if (merchantAccount && !merchantAccount.welcome_message_shown) {
      await base44.entities.LoyaltyAccount.update(merchantAccount.id, {
        welcome_message_shown: true
      });
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Welcome Dialog */}
      <WelcomeTrialDialog
        isOpen={showWelcome}
        onClose={handleCloseWelcome}
        userName={user?.full_name}
        daysRemaining={daysRemaining}
        isMerchant={true}
        storeCode={selectedStore?.code}
      />

      {showTrialBanner && (
        <div className="fixed top-16 left-0 right-0 z-40">
          <TrialBanner trialEndDate={merchantAccount?.trial_end_date} />
        </div>
      )}
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Link to={createPageUrl('Home')}>
              <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/10">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-600 flex items-center justify-center">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Punto de Venta</h1>
                <p className="text-white/70 text-sm">Sistema de puntos</p>
              </div>
            </div>
          </div>

          {/* Store Selector */}
          {stores?.length > 0 && (
            <Select 
              value={selectedStore?.id} 
              onValueChange={(id) => setSelectedStore(stores.find(s => s.id === id))}
            >
              <SelectTrigger className="bg-white/10 border-white/20 text-white">
                <SelectValue placeholder="Selecciona tienda" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-6">
        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full grid grid-cols-3 mb-6">
            <TabsTrigger value="earn" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Acumular
            </TabsTrigger>
            <TabsTrigger value="burn" className="flex items-center gap-2">
              <Gift className="h-4 w-4" />
              Canjear
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Historial
            </TabsTrigger>
          </TabsList>

          {/* Earn Tab */}
          <TabsContent value="earn">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5 text-emerald-600" />
                  Acumular Puntos
                </CardTitle>
                <CardDescription>
                  Registra una compra para que el cliente acumule puntos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Customer Search */}
                <div>
                  <Label>Buscar cliente (email o código QR)</Label>
                  <div className="relative mt-1.5">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Email o código QR..."
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setSelectedCustomer(null);
                      }}
                      className="pl-10"
                    />
                  </div>

                  {/* Search Results */}
                  {searching && (
                    <div className="mt-2 p-3 bg-slate-50 rounded-lg flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-slate-500">Buscando...</span>
                    </div>
                  )}

                  {searchResults?.length > 0 && !selectedCustomer && (
                    <div className="mt-2 space-y-2">
                      {searchResults.map((account) => (
                        <button
                          key={account.id}
                          onClick={() => {
                            setSelectedCustomer(account);
                            setCustomerSearch(account.user_email);
                          }}
                          className="w-full p-3 bg-white rounded-lg border border-slate-200 hover:border-violet-300 hover:shadow-sm transition-all flex items-center gap-3 text-left"
                        >
                          <div className="h-10 w-10 rounded-full bg-violet-100 flex items-center justify-center">
                            <User className="h-5 w-5 text-violet-600" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-slate-900">{account.user_name}</p>
                            <p className="text-sm text-slate-500">{account.user_email}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-violet-600">{account.current_balance?.toLocaleString()}</p>
                            <p className="text-xs text-slate-400">puntos</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {customerSearch.length >= 3 && searchResults?.length === 0 && !searching && (
                    <div className="mt-2 p-4 bg-orange-50 rounded-lg text-center">
                      <AlertCircle className="h-6 w-6 text-orange-500 mx-auto mb-2" />
                      <p className="text-sm text-orange-700">Cliente no encontrado</p>
                    </div>
                  )}
                </div>

                {/* Selected Customer */}
                {selectedCustomer && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-violet-50 rounded-xl border border-violet-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-violet-100 flex items-center justify-center">
                        <User className="h-6 w-6 text-violet-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{selectedCustomer.user_name}</p>
                        <p className="text-sm text-slate-500">{selectedCustomer.user_email}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-violet-600">
                          {selectedCustomer.current_balance?.toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-400">puntos actuales</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Amount & Ticket */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Monto de compra (MXN)</Label>
                    <div className="relative mt-1.5">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={earnAmount}
                        onChange={(e) => setEarnAmount(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>No. de ticket (opcional)</Label>
                    <div className="relative mt-1.5">
                      <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="Ticket ID"
                        value={ticketId}
                        onChange={(e) => setTicketId(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                </div>

                {/* Points Preview */}
                {earnAmount && parseFloat(earnAmount) > 0 && (
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                    <p className="text-sm text-emerald-700">El cliente ganará:</p>
                    <p className="text-3xl font-bold text-emerald-600">
                      +{Math.floor(parseFloat(earnAmount) / 10 * (selectedStore?.points_rate || 1))} puntos
                    </p>
                  </div>
                )}

                {/* Submit Button */}
                <Button
                  onClick={() => earnMutation.mutate()}
                  disabled={!selectedCustomer || !earnAmount || earnMutation.isPending}
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-700"
                >
                  {earnMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Plus className="h-5 w-5 mr-2" />
                      Registrar compra
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Burn Tab */}
          <TabsContent value="burn">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-violet-600" />
                  Canjear Puntos
                </CardTitle>
                <CardDescription>
                  Procesa el canje de puntos del cliente
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Customer Search (same as earn) */}
                <div>
                  <Label>Buscar cliente (email o código QR)</Label>
                  <div className="relative mt-1.5">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Email o código QR..."
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setSelectedCustomer(null);
                      }}
                      className="pl-10"
                    />
                  </div>

                  {searchResults?.length > 0 && !selectedCustomer && (
                    <div className="mt-2 space-y-2">
                      {searchResults.map((account) => (
                        <button
                          key={account.id}
                          onClick={() => {
                            setSelectedCustomer(account);
                            setCustomerSearch(account.user_email);
                          }}
                          className="w-full p-3 bg-white rounded-lg border border-slate-200 hover:border-violet-300 hover:shadow-sm transition-all flex items-center gap-3 text-left"
                        >
                          <div className="h-10 w-10 rounded-full bg-violet-100 flex items-center justify-center">
                            <User className="h-5 w-5 text-violet-600" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-slate-900">{account.user_name}</p>
                            <p className="text-sm text-slate-500">{account.user_email}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-violet-600">{account.current_balance?.toLocaleString()}</p>
                            <p className="text-xs text-slate-400">puntos</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedCustomer && (
                  <>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-violet-50 rounded-xl border border-violet-200"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-violet-100 flex items-center justify-center">
                          <User className="h-6 w-6 text-violet-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-slate-900">{selectedCustomer.user_name}</p>
                          <p className="text-sm text-slate-500">{selectedCustomer.user_email}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-violet-600">
                            {selectedCustomer.current_balance?.toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-400">puntos disponibles</p>
                        </div>
                      </div>
                    </motion.div>

                    <div>
                      <Label>Puntos a canjear</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={burnPoints}
                        onChange={(e) => setBurnPoints(e.target.value)}
                        max={selectedCustomer.current_balance}
                        className="mt-1.5"
                      />
                      <p className="text-xs text-slate-400 mt-1">
                        Máximo: {selectedCustomer.current_balance?.toLocaleString()} puntos
                      </p>
                    </div>

                    {burnPoints && parseInt(burnPoints) > 0 && (
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <p className="text-sm text-slate-600">Saldo después del canje:</p>
                        <p className="text-2xl font-bold text-slate-800">
                          {(selectedCustomer.current_balance - parseInt(burnPoints)).toLocaleString()} puntos
                        </p>
                      </div>
                    )}

                    <Button
                      onClick={() => burnMutation.mutate()}
                      disabled={!burnPoints || parseInt(burnPoints) < 1 || burnMutation.isPending}
                      className="w-full h-12 bg-violet-600 hover:bg-violet-700"
                    >
                      {burnMutation.isPending ? (
                        <>
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          Procesando...
                        </>
                      ) : (
                        <>
                          <Gift className="h-5 w-5 mr-2" />
                          Confirmar canje
                        </>
                      )}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5 text-slate-600" />
                  Transacciones Recientes
                </CardTitle>
                <CardDescription>
                  Últimos movimientos en {selectedStore?.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {recentTransactions?.length > 0 ? (
                  <div className="space-y-3">
                    {recentTransactions.map((tx) => (
                      <div 
                        key={tx.id}
                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                      >
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                          tx.type === 'EARN' ? 'bg-emerald-100' : 'bg-violet-100'
                        }`}>
                          {tx.type === 'EARN' ? (
                            <Plus className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <Minus className="h-5 w-5 text-violet-600" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-slate-900 text-sm">{tx.description}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(tx.created_date).toLocaleString('es-MX')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${
                            tx.points > 0 ? 'text-emerald-600' : 'text-slate-600'
                          }`}>
                            {tx.points > 0 ? '+' : ''}{tx.points.toLocaleString()}
                          </p>
                          {tx.amount > 0 && (
                            <p className="text-xs text-slate-400">${tx.amount} MXN</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <History className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">No hay transacciones aún</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Result Dialog */}
      <Dialog open={!!showResult} onOpenChange={() => setShowResult(null)}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center py-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4"
            >
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </motion.div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              ¡{showResult?.action === 'earn' ? 'Puntos acreditados' : 'Canje procesado'}!
            </h3>
            
            {showResult?.action === 'earn' && (
              <div className="bg-emerald-50 rounded-xl p-4 mt-4">
                <p className="text-emerald-700">El cliente ganó</p>
                <p className="text-3xl font-bold text-emerald-600">
                  +{showResult.data.pointsEarned.toLocaleString()} puntos
                </p>
                <p className="text-sm text-emerald-600 mt-2">
                  Por compra de ${showResult.data.amount.toLocaleString()} MXN
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  Nuevo saldo: {showResult.data.newBalance.toLocaleString()} puntos
                </p>
              </div>
            )}

            {showResult?.action === 'burn' && (
              <div className="bg-violet-50 rounded-xl p-4 mt-4">
                <p className="text-violet-700">Puntos canjeados</p>
                <p className="text-3xl font-bold text-violet-600">
                  -{showResult.data.pointsBurned.toLocaleString()} puntos
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  Nuevo saldo: {showResult.data.newBalance.toLocaleString()} puntos
                </p>
              </div>
            )}

            <Button 
              onClick={() => setShowResult(null)} 
              className="mt-6 w-full bg-slate-800 hover:bg-slate-900"
            >
              Continuar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}