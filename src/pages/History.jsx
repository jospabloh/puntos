import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Search,
  Calendar,
  TrendingUp,
  TrendingDown,
  Sparkles,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import TransactionItem from '../components/loyalty/TransactionItem';
import SuspendedAccountModal from '../components/loyalty/SuspendedAccountModal';
import TrialBanner from '../components/loyalty/TrialBanner';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

export default function History() {
  const [user, setUser] = useState(null);
  const [filter, setFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

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

  // Fetch all transactions
  const { data: transactions, isLoading } = useQuery({
    queryKey: ['allTransactions', account?.id],
    queryFn: () => base44.entities.PointsLedger.filter(
      { account_id: account?.id }, 
      '-created_date', 
      100
    ),
    enabled: !!account?.id,
  });

  // Filter transactions
  const filteredTransactions = React.useMemo(() => {
    if (!transactions) return [];
    
    let filtered = [...transactions];

    // Filter by type
    if (filter !== 'all') {
      filtered = filtered.filter(tx => tx.type === filter);
    }

    // Filter by date range
    const now = new Date();
    if (dateRange === '7days') {
      const weekAgo = subDays(now, 7);
      filtered = filtered.filter(tx => new Date(tx.created_date) >= weekAgo);
    } else if (dateRange === '30days') {
      const monthAgo = subDays(now, 30);
      filtered = filtered.filter(tx => new Date(tx.created_date) >= monthAgo);
    } else if (dateRange === 'thisMonth') {
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      filtered = filtered.filter(tx => {
        const date = new Date(tx.created_date);
        return date >= start && date <= end;
      });
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(tx => 
        tx.description?.toLowerCase().includes(query) ||
        tx.store_name?.toLowerCase().includes(query) ||
        tx.ticket_id?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [transactions, filter, dateRange, searchQuery]);

  // Group transactions by date
  const groupedTransactions = React.useMemo(() => {
    const groups = {};
    filteredTransactions.forEach(tx => {
      const date = format(new Date(tx.created_date), 'yyyy-MM-dd');
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(tx);
    });
    return groups;
  }, [filteredTransactions]);

  // Calculate summary
  const summary = React.useMemo(() => {
    const earned = filteredTransactions
      .filter(tx => tx.type === 'EARN' || tx.type === 'BONUS')
      .reduce((sum, tx) => sum + (tx.points || 0), 0);

    const burned = filteredTransactions
      .filter(tx => tx.type === 'BURN')
      .reduce((sum, tx) => sum + Math.abs(tx.points || 0), 0);

    return { earned, burned, count: filteredTransactions.length };
  }, [filteredTransactions]);

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

  return (
    <div className="min-h-screen pb-24 md:pb-8 bg-slate-50">
      {isSuspended && <SuspendedAccountModal />}
      {!isSuspended && showTrialBanner && (
        <div className="fixed top-16 left-0 right-0 z-40">
          <TrialBanner trialEndDate={account?.trial_end_date} />
        </div>
      )}
      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-16 z-40">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <Link to={createPageUrl('Home')} aria-label="Volver al inicio">
              <Button variant="ghost" size="icon" tabIndex={-1}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Historial</h1>
              <p className="text-slate-500 text-sm">Todos tus movimientos</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar transacción..."
              aria-label="Buscar transacción"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-50 border-0"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-slate-400" />
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2">
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList className="bg-slate-100">
                <TabsTrigger value="all" className="text-xs">Todos</TabsTrigger>
                <TabsTrigger value="EARN" className="text-xs">Ganados</TabsTrigger>
                <TabsTrigger value="BURN" className="text-xs">Canjeados</TabsTrigger>
                <TabsTrigger value="BONUS" className="text-xs">Bonus</TabsTrigger>
              </TabsList>
            </Tabs>
            
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-32 h-8 text-xs bg-slate-100 border-0">
                <Calendar className="h-3 w-3 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo</SelectItem>
                <SelectItem value="7days">7 días</SelectItem>
                <SelectItem value="30days">30 días</SelectItem>
                <SelectItem value="thisMonth">Este mes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="max-w-lg mx-auto px-4 py-4">
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-6 rounded-lg bg-emerald-100 flex items-center justify-center">
                <TrendingUp className="h-3 w-3 text-emerald-600" />
              </div>
            </div>
            <p className="text-lg font-bold text-emerald-600">+{summary.earned.toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">Ganados</p>
          </div>
          
          <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-6 rounded-lg bg-violet-100 flex items-center justify-center">
                <TrendingDown className="h-3 w-3 text-violet-600" />
              </div>
            </div>
            <p className="text-lg font-bold text-violet-600">-{summary.burned.toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">Canjeados</p>
          </div>
          
          <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-6 rounded-lg bg-slate-100 flex items-center justify-center">
                <Sparkles className="h-3 w-3 text-slate-600" />
              </div>
            </div>
            <p className="text-lg font-bold text-slate-700">{summary.count}</p>
            <p className="text-[10px] text-slate-500">Movimientos</p>
          </div>
        </div>

        {/* Transaction List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : Object.keys(groupedTransactions).length > 0 ? (
          <div className="space-y-6">
            {Object.entries(groupedTransactions).map(([date, txs]) => (
              <div key={date}>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3 px-1">
                  {format(new Date(date), "EEEE, d 'de' MMMM", { locale: es })}
                </p>
                <div className="space-y-3">
                  {txs.map((tx, index) => (
                    <TransactionItem 
                      key={tx.id} 
                      transaction={tx} 
                      index={index}
                      showDetails
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Search className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-slate-500 font-medium">No hay movimientos</p>
            <p className="text-slate-400 text-sm mt-1">
              {searchQuery || filter !== 'all' || dateRange !== 'all'
                ? 'Intenta cambiar los filtros'
                : 'Realiza tu primera compra para ver tu historial'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}