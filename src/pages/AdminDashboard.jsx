import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useRequirePage } from '@/lib/useCurrentUser';
import { getActiveBusinessId } from '@/lib/activeTenant';
import { motion } from 'framer-motion';
import {
  Users,
  TrendingUp,
  Store,
  Gift,
  AlertTriangle,
  DollarSign,
  BarChart3,
  PieChart as PieChartIcon,
  Calendar,
  Percent,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  PageShell,
  PageHeader,
  StatTile,
  SectionCard,
  PageLoader,
} from '@/components/backoffice/Kit';

const RANGE_LABEL = { '7days': '7d', '30days': '30d', '90days': '90d' };

export default function AdminDashboard() {
  const { user, role, ready } = useRequirePage('AdminDashboard');
  const [dateRange, setDateRange] = useState('7days');

  // Tenant scoping: owner sees everything ({}), business_admin only their business.
  const activeBusinessId = getActiveBusinessId(user);
  const scope = { business_id: activeBusinessId };
  const scopeKey = activeBusinessId || 'none';

  // Fetch all accounts
  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ['allAccounts', scopeKey],
    queryFn: () => base44.entities.LoyaltyAccount.filter(scope, '-created_date', 1000),
    enabled: !!user,
  });

  // Fetch all transactions
  const { data: transactions, isLoading: loadingTransactions } = useQuery({
    queryKey: ['allTransactions', scopeKey],
    queryFn: () => base44.entities.PointsLedger.filter(scope, '-created_date', 1000),
    enabled: !!user,
  });

  // Fetch stores
  const { data: stores } = useQuery({
    queryKey: ['allStores', scopeKey],
    queryFn: () => base44.entities.Store.filter(scope),
    enabled: !!user,
  });

  // Fetch offers
  const { data: offers } = useQuery({
    queryKey: ['allOffers', scopeKey],
    queryFn: () => base44.entities.Offer.filter(scope),
    enabled: !!user,
  });

  // Fetch flagged transactions
  const { data: flaggedTx } = useQuery({
    queryKey: ['flaggedTransactions', scopeKey],
    queryFn: () => base44.entities.PointsLedger.filter({ ...scope, status: 'flagged' }),
    enabled: !!user,
  });

  // Calculate metrics
  const metrics = React.useMemo(() => {
    if (!accounts || !transactions) return null;

    const totalBalance = accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);
    const totalEarned = transactions.filter(t => t.type === 'EARN' || t.type === 'BONUS')
      .reduce((sum, t) => sum + (t.points || 0), 0);
    const totalBurned = transactions.filter(t => t.type === 'BURN')
      .reduce((sum, t) => sum + Math.abs(t.points || 0), 0);

    // Get date range
    const days = dateRange === '7days' ? 7 : dateRange === '30days' ? 30 : 90;
    const startDate = subDays(new Date(), days);

    const recentTx = transactions.filter(t => new Date(t.created_date) >= startDate);
    const recentEarned = recentTx.filter(t => t.type === 'EARN' || t.type === 'BONUS')
      .reduce((sum, t) => sum + (t.points || 0), 0);
    const recentBurned = recentTx.filter(t => t.type === 'BURN')
      .reduce((sum, t) => sum + Math.abs(t.points || 0), 0);

    // Tier distribution
    const tierCounts = { bronze: 0, silver: 0, gold: 0, platinum: 0 };
    accounts.forEach(a => {
      const tier = a.tier || 'bronze';
      if (tier in tierCounts) tierCounts[tier]++;
      else tierCounts.bronze++;
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
      tierCounts,
    };
  }, [accounts, transactions, dateRange]);

  // Chart data
  const chartData = React.useMemo(() => {
    if (!transactions) return [];

    const days = dateRange === '7days' ? 7 : dateRange === '30days' ? 30 : 90;
    const data = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);

      const dayTx = transactions.filter(t => {
        const txDate = new Date(t.created_date);
        return txDate >= dayStart && txDate <= dayEnd;
      });

      const earned = dayTx.filter(t => t.type === 'EARN' || t.type === 'BONUS')
        .reduce((sum, t) => sum + (t.points || 0), 0);
      const burned = dayTx.filter(t => t.type === 'BURN')
        .reduce((sum, t) => sum + Math.abs(t.points || 0), 0);

      data.push({
        date: format(date, days > 7 ? 'd MMM' : 'EEE', { locale: es }),
        earned,
        burned,
        net: earned - burned,
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
      { name: 'Platino', value: metrics.tierCounts.platinum, color: '#8B5CF6' },
    ];
  }, [metrics]);

  if (!ready) return <PageLoader />;

  const rangeLabel = RANGE_LABEL[dateRange] || '7d';

  const dateSelect = (
    <Select value={dateRange} onValueChange={setDateRange}>
      <SelectTrigger className="w-36 border-slate-200 bg-white">
        <Calendar className="mr-2 h-4 w-4 text-slate-400" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="7days">7 días</SelectItem>
        <SelectItem value="30days">30 días</SelectItem>
        <SelectItem value="90days">90 días</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <PageShell>
      <PageHeader
        icon={BarChart3}
        eyebrow="Programa de lealtad"
        title="Panel"
        description="Resumen de actividad, puntos en circulación y desempeño del programa."
        actions={dateSelect}
      />

      {/* Alerts */}
      {flaggedTx?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-orange-500" />
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

      {/* Main metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Clientes activos"
          value={(metrics?.activeAccounts || 0).toLocaleString()}
          icon={Users}
          tone="violet"
          loading={loadingAccounts}
        />
        <StatTile
          label="Puntos en circulación"
          value={(metrics?.totalBalance || 0).toLocaleString()}
          icon={DollarSign}
          tone="gold"
          loading={loadingAccounts}
        />
        <StatTile
          label={`Acumulados (${rangeLabel})`}
          value={`+${(metrics?.recentEarned || 0).toLocaleString()}`}
          icon={TrendingUp}
          tone="emerald"
          loading={loadingTransactions}
        />
        <StatTile
          label={`Canjeados (${rangeLabel})`}
          value={`-${(metrics?.recentBurned || 0).toLocaleString()}`}
          icon={Gift}
          tone="pink"
          loading={loadingTransactions}
        />
      </div>

      {/* Charts */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Actividad de puntos" icon={BarChart3} className="lg:col-span-2" bodyClassName="p-4">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="earned" name="Acumulados" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="burned" name="Canjeados" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Distribución por nivel" icon={PieChartIcon} bodyClassName="p-4">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={tierData || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {(tierData || []).map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {(tierData || []).map((tier) => (
              <div key={tier.name} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: tier.color }} />
                <span className="text-xs text-slate-600 tnum">
                  {tier.name}: {tier.value}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Tasa de canje"
          value={`${metrics?.redemptionRate || 0}%`}
          sublabel="Del total de puntos emitidos"
          icon={Percent}
          tone="violet"
        />
        <StatTile
          label="Breakage"
          value={(metrics?.breakage || 0).toLocaleString()}
          sublabel="Puntos emitidos sin canjear"
          icon={Sparkles}
          tone="emerald"
        />
        <StatTile
          label="Tiendas activas"
          value={stores?.filter(s => s.status === 'active').length || 0}
          sublabel={`De ${stores?.length || 0} registradas`}
          icon={Store}
          tone="sky"
        />
        <StatTile
          label="Ofertas"
          value={offers?.length || 0}
          sublabel="Campañas configuradas"
          icon={Gift}
          tone="gold"
        />
      </div>
    </PageShell>
  );
}
