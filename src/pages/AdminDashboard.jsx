import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  Users, 
  TrendingUp, 
  TrendingDown, 
  Store, 
  Gift,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  DollarSign,
  Activity,
  BarChart3,
  Calendar
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [dateRange, setDateRange] = useState('7days');

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      if (userData.role !== 'admin') {
        window.location.href = createPageUrl('Home');
        return;
      }
      setUser(userData);
    } catch (e) {
      base44.auth.redirectToLogin();
    }
  };

  // Fetch all accounts
  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ['allAccounts'],
    queryFn: () => base44.entities.LoyaltyAccount.list('-created_date', 1000),
    enabled: !!user,
  });

  // Fetch all transactions
  const { data: transactions, isLoading: loadingTransactions } = useQuery({
    queryKey: ['allTransactions'],
    queryFn: () => base44.entities.PointsLedger.list('-created_date', 1000),
    enabled: !!user,
  });

  // Fetch stores
  const { data: stores } = useQuery({
    queryKey: ['allStores'],
    queryFn: () => base44.entities.Store.list(),
    enabled: !!user,
  });

  // Fetch offers
  const { data: offers } = useQuery({
    queryKey: ['allOffers'],
    queryFn: () => base44.entities.Offer.list(),
    enabled: !!user,
  });

  // Fetch flagged transactions
  const { data: flaggedTx } = useQuery({
    queryKey: ['flaggedTransactions'],
    queryFn: () => base44.entities.PointsLedger.filter({ status: 'flagged' }),
    enabled: !!user,
  });

  // Calculate metrics
  const metrics = React.useMemo(() => {
    if (!accounts || !transactions) return null;

    const totalBalance = accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);
    const totalEarned = transactions.filter(t => t.type === 'EARN' || t.type === 'BONUS')
      .reduce((sum, t) => sum + t.points, 0);
    const totalBurned = transactions.filter(t => t.type === 'BURN')
      .reduce((sum, t) => sum + Math.abs(t.points), 0);

    // Get date range
    const days = dateRange === '7days' ? 7 : dateRange === '30days' ? 30 : 90;
    const startDate = subDays(new Date(), days);
    
    const recentTx = transactions.filter(t => new Date(t.created_date) >= startDate);
    const recentEarned = recentTx.filter(t => t.type === 'EARN' || t.type === 'BONUS')
      .reduce((sum, t) => sum + t.points, 0);
    const recentBurned = recentTx.filter(t => t.type === 'BURN')
      .reduce((sum, t) => sum + Math.abs(t.points), 0);

    // Tier distribution
    const tierCounts = { bronze: 0, silver: 0, gold: 0, platinum: 0 };
    accounts.forEach(a => {
      tierCounts[a.tier || 'bronze']++;
    });

    return {
      totalAccounts: accounts.length,
      activeAccounts: accounts.filter(a => a.status === 'active').length,
      totalBalance,
      totalEarned,
      totalBurned,
      recentEarned,
      recentBurned,
      redemptionRate: totalEarned > 0 ? Math.round((totalBurned / totalEarned) * 100) : 0,
      breakage: totalEarned - totalBurned,
      tierCounts
    };
  }, [accounts, transactions, dateRange]);

  // Chart data
  const chartData = React.useMemo(() => {
    if (!transactions) return [];

    const days = dateRange === '7days' ? 7 : dateRange === '30days' ? 30 : 90;
    const data = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);

      const dayTx = transactions.filter(t => {
        const txDate = new Date(t.created_date);
        return txDate >= dayStart && txDate <= dayEnd;
      });

      const earned = dayTx.filter(t => t.type === 'EARN' || t.type === 'BONUS')
        .reduce((sum, t) => sum + t.points, 0);
      const burned = dayTx.filter(t => t.type === 'BURN')
        .reduce((sum, t) => sum + Math.abs(t.points), 0);

      data.push({
        date: format(date, days > 7 ? 'd MMM' : 'EEE', { locale: es }),
        earned,
        burned,
        net: earned - burned
      });
    }

    return data;
  }, [transactions, dateRange]);

  // Tier chart data
  const tierData = React.useMemo(() => {
    if (!metrics) return [];
    return [
      { name: 'Bronce', value: metrics.tierCounts.bronze, color: '#D97706' },
      { name: 'Plata', value: metrics.tierCounts.silver, color: '#6B7280' },
      { name: 'Oro', value: metrics.tierCounts.gold, color: '#F59E0B' },
      { name: 'Platino', value: metrics.tierCounts.platinum, color: '#8B5CF6' }
    ];
  }, [metrics]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-violet-600">Cargando...</div>
      </div>
    );
  }

  const quickLinks = [
    { label: 'Tiendas', page: 'AdminStores', icon: Store, count: stores?.length },
    { label: 'Campañas', page: 'AdminCampaigns', icon: Sparkles, count: offers?.length },
    { label: 'Clientes', page: 'AdminCustomers', icon: Users, count: accounts?.length },
    { label: 'Auditoría', page: 'AdminAudit', icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">Dashboard Admin</h1>
              <p className="text-slate-400">Programa de Lealtad</p>
            </div>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-36 bg-white/10 border-white/20 text-white">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">7 días</SelectItem>
                <SelectItem value="30days">30 días</SelectItem>
                <SelectItem value="90days">90 días</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-4 gap-3">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link key={link.page} to={createPageUrl(link.page)}>
                  <div className="bg-white/10 hover:bg-white/20 rounded-xl p-4 transition-all">
                    <div className="flex items-center justify-between">
                      <Icon className="h-5 w-5 text-white/70" />
                      {link.count !== undefined && (
                        <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                          {link.count}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium mt-2">{link.label}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-6">
        {/* Alerts */}
        {flaggedTx?.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-center gap-3"
          >
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <div className="flex-1">
              <p className="font-medium text-orange-800">
                {flaggedTx.length} transacción(es) marcadas para revisión
              </p>
              <p className="text-sm text-orange-600">Requieren atención manual</p>
            </div>
            <Link to={createPageUrl('AdminAudit')}>
              <Button variant="outline" size="sm" className="border-orange-300 text-orange-700">
                Revisar
              </Button>
            </Link>
          </motion.div>
        )}

        {/* Main Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">Clientes Activos</p>
                  {loadingAccounts ? (
                    <Skeleton className="h-8 w-24 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold text-slate-900">
                      {metrics?.activeAccounts.toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-violet-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">Puntos en Circulación</p>
                  {loadingAccounts ? (
                    <Skeleton className="h-8 w-32 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold text-slate-900">
                      {metrics?.totalBalance.toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">Acumulados ({dateRange === '7days' ? '7d' : dateRange === '30days' ? '30d' : '90d'})</p>
                  {loadingTransactions ? (
                    <Skeleton className="h-8 w-28 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold text-emerald-600">
                      +{metrics?.recentEarned.toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">Canjeados ({dateRange === '7days' ? '7d' : dateRange === '30days' ? '30d' : '90d'})</p>
                  {loadingTransactions ? (
                    <Skeleton className="h-8 w-28 mt-1" />
                  ) : (
                    <p className="text-3xl font-bold text-violet-600">
                      -{metrics?.recentBurned.toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center">
                  <Gift className="h-5 w-5 text-violet-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Main Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-slate-400" />
                Actividad de Puntos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'white', 
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="earned" name="Acumulados" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="burned" name="Canjeados" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Tier Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Distribución por Nivel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={tierData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {tierData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                {tierData.map((tier) => (
                  <div key={tier.name} className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: tier.color }} />
                    <span className="text-xs text-slate-600">
                      {tier.name}: {tier.value}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-slate-500 mb-2">Tasa de Canje</p>
              <p className="text-4xl font-bold text-slate-900">{metrics?.redemptionRate || 0}%</p>
              <p className="text-xs text-slate-400 mt-1">
                Del total de puntos emitidos
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-slate-500 mb-2">Breakage (No Canjeados)</p>
              <p className="text-4xl font-bold text-emerald-600">
                {metrics?.breakage?.toLocaleString() || 0}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Puntos emitidos sin canjear
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-slate-500 mb-2">Tiendas Activas</p>
              <p className="text-4xl font-bold text-slate-900">
                {stores?.filter(s => s.status === 'active').length || 0}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                De {stores?.length || 0} registradas
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}