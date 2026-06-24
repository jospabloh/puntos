import React, { useState } from 'react';
import { makeIdempotencyKey } from '@/lib/utils';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequirePage } from '@/lib/useCurrentUser';
import { ROLES } from '@/lib/rbac';
import {
  Users,
  Search,
  MoreVertical,
  Star,
  TrendingUp,
  TrendingDown,
  Eye,
  AlertTriangle,
  RefreshCw,
  Coins,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { PageShell, PageHeader, StatTile, SectionCard, StatusPill, EmptyState, Toolbar, PageLoader } from '@/components/backoffice/Kit';

const tierConfig = {
  bronze: { label: 'Bronce', color: 'bg-amber-100 text-amber-700' },
  silver: { label: 'Plata', color: 'bg-slate-100 text-slate-700' },
  gold: { label: 'Oro', color: 'bg-yellow-100 text-yellow-700' },
  platinum: { label: 'Platino', color: 'bg-violet-100 text-violet-700' },
};

function tierBadge(tier, className = '') {
  const t = tierConfig[tier || 'bronze'];
  return (
    <Badge className={`${t.color} ${className}`}>
      <Star className="mr-1 h-3 w-3" />
      {t.label}
    </Badge>
  );
}

function CustomerRow({ account, onView, onAdjust }) {
  return (
    <TableRow className="hover:bg-slate-50">
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100">
            <span className="font-medium text-violet-600">
              {account.user_name?.[0]?.toUpperCase() || '?'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{account.user_name || 'Sin nombre'}</p>
            <p className="truncate text-sm text-slate-500">{account.user_email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <StatusPill status={account.status === 'suspended' ? 'suspended' : 'active'} label={account.status === 'suspended' ? 'Suspendido' : 'Activo'} />
          {tierBadge(account.tier)}
        </div>
      </TableCell>
      <TableCell className="text-right font-bold text-violet-600 tnum">
        {(account.current_balance || 0).toLocaleString('es-MX')}
      </TableCell>
      <TableCell className="text-right text-emerald-600 tnum">
        +{(account.lifetime_earned || 0).toLocaleString('es-MX')}
      </TableCell>
      <TableCell className="text-right text-slate-600 tnum">
        -{(account.lifetime_redeemed || 0).toLocaleString('es-MX')}
      </TableCell>
      <TableCell className="text-sm text-slate-500">
        {account.last_activity
          ? format(new Date(account.last_activity), 'd MMM, HH:mm', { locale: es })
          : 'Nunca'}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Acciones de ${account.user_name || 'cliente'}`}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(account)}>
              <Eye className="mr-2 h-4 w-4" />
              Ver detalles
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAdjust(account)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Ajustar puntos
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export default function AdminCustomers() {
  const { user, role, ready } = useRequirePage('AdminCustomers');
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [adjustData, setAdjustData] = useState({ points: 0, reason: '' });
  const queryClient = useQueryClient();

  // Tenant scoping: owner sees everything ({}), business_admin only their business.
  const scope = role === ROLES.OWNER ? {} : { business_id: user?.business_id };
  const scopeKey = role === ROLES.OWNER ? 'all' : user?.business_id;

  // Fetch all accounts
  const { data: accounts, isLoading } = useQuery({
    queryKey: ['allAccounts', scopeKey],
    queryFn: () => base44.entities.LoyaltyAccount.filter(scope, '-created_date', 500),
    enabled: !!user,
  });

  // Fetch transactions for selected customer
  const { data: customerTransactions } = useQuery({
    queryKey: ['customerTransactions', selectedCustomer?.id],
    queryFn: () => base44.entities.PointsLedger.filter(
      { account_id: selectedCustomer?.id },
      '-created_date',
      20,
    ),
    enabled: !!selectedCustomer?.id,
  });

  // Adjust points mutation
  const adjustMutation = useMutation({
    mutationFn: async () => {
      const points = parseInt(adjustData.points, 10);
      if (Number.isNaN(points) || points === 0) {
        throw new Error('Ingresa una cantidad de puntos válida');
      }
      if (!adjustData.reason.trim()) {
        throw new Error('La razón es obligatoria');
      }

      const idempotencyKey = makeIdempotencyKey(`adjust_${selectedCustomer.id}`);
      const newBalance = (selectedCustomer.current_balance || 0) + points;

      // Stamp the customer's tenant (owner may adjust across tenants, so derive
      // business_id from the account, not from the acting user).
      const businessId = selectedCustomer.business_id || user.business_id;
      const businessName = selectedCustomer.business_name || user.business_name;

      // Create ledger entry
      await base44.entities.PointsLedger.create({
        business_id: businessId,
        business_name: businessName,
        account_id: selectedCustomer.id,
        user_id: selectedCustomer.user_id,
        type: 'ADJUST',
        points: points,
        balance_after: newBalance,
        reference_type: 'manual',
        idempotency_key: idempotencyKey,
        description: `Ajuste manual: ${adjustData.reason}`,
        reason: adjustData.reason,
        operator_id: user.id,
        operator_email: user.email,
        status: 'completed',
      });

      // Update account
      await base44.entities.LoyaltyAccount.update(selectedCustomer.id, {
        current_balance: newBalance,
        lifetime_earned: points > 0
          ? (selectedCustomer.lifetime_earned || 0) + points
          : selectedCustomer.lifetime_earned,
        last_activity: new Date().toISOString(),
      });

      // Audit log
      await base44.entities.AuditLog.create({
        business_id: businessId,
        business_name: businessName,
        actor_id: user.id,
        actor_email: user.email,
        actor_role: role === ROLES.OWNER ? 'admin' : role,
        action: 'adjust',
        entity_type: 'PointsLedger',
        target_user_id: selectedCustomer.user_id,
        payload_summary: `${points > 0 ? '+' : ''}${points} pts: ${adjustData.reason}`,
        status: 'success',
      });

      return { points, newBalance };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allAccounts'] });
      queryClient.invalidateQueries({ queryKey: ['customerTransactions'] });
      setShowAdjustDialog(false);
      setAdjustData({ points: 0, reason: '' });
      toast.success('Ajuste realizado correctamente');
    },
    onError: (error) => {
      toast.error(error.message || 'Error al realizar el ajuste');
    },
  });

  // Filter accounts
  const allAccounts = accounts || [];
  const filteredAccounts = allAccounts.filter((account) => {
    const matchesSearch =
      account.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.user_email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTier = tierFilter === 'all' || account.tier === tierFilter;
    return matchesSearch && matchesTier;
  });

  const totalBalance = allAccounts.reduce((a, acc) => a + (acc.current_balance || 0), 0);
  const totalEarned = allAccounts.reduce((a, acc) => a + (acc.lifetime_earned || 0), 0);

  if (!ready) return <PageLoader />;

  const handleView = (account) => setSelectedCustomer(account);
  const handleAdjust = (account) => { setSelectedCustomer(account); setShowAdjustDialog(true); };

  return (
    <PageShell>
      <PageHeader
        icon={Users}
        eyebrow="Programa"
        title="Clientes"
        description="Consulta los saldos de tus clientes y realiza ajustes manuales de puntos."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Clientes" value={allAccounts.length} icon={Users} tone="violet" loading={isLoading} />
        <StatTile label="Saldo total" value={totalBalance.toLocaleString('es-MX')} icon={Coins} tone="gold" loading={isLoading} />
        <StatTile label="Puntos ganados" value={totalEarned.toLocaleString('es-MX')} icon={TrendingUp} tone="emerald" loading={isLoading} />
      </div>

      <Toolbar>
        <div className="relative w-full sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar por nombre o email…"
            aria-label="Buscar clientes"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-slate-200 bg-white pl-10"
          />
        </div>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-full sm:w-40 bg-white">
            <SelectValue placeholder="Nivel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los niveles</SelectItem>
            <SelectItem value="bronze">Bronce</SelectItem>
            <SelectItem value="silver">Plata</SelectItem>
            <SelectItem value="gold">Oro</SelectItem>
            <SelectItem value="platinum">Platino</SelectItem>
          </SelectContent>
        </Select>
      </Toolbar>

      {isLoading ? (
        <SectionCard bodyClassName="p-0">
          <div className="divide-y divide-slate-100">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 animate-pulse bg-slate-50/60" />
            ))}
          </div>
        </SectionCard>
      ) : filteredAccounts.length > 0 ? (
        <SectionCard bodyClassName="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/70">
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado / Nivel</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Ganados</TableHead>
                  <TableHead className="text-right">Canjeados</TableHead>
                  <TableHead>Última actividad</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.map((account) => (
                  <CustomerRow
                    key={account.id}
                    account={account}
                    onView={handleView}
                    onAdjust={handleAdjust}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      ) : (
        <EmptyState
          icon={Users}
          title={allAccounts.length ? 'Sin resultados' : 'Aún no tienes clientes'}
          description={allAccounts.length ? 'Ningún cliente coincide con tu búsqueda o filtro.' : 'Tus clientes aparecerán aquí cuando se registren en tu programa.'}
        />
      )}

      {/* Customer Detail Dialog */}
      <Dialog open={!!selectedCustomer && !showAdjustDialog} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle del cliente</DialogTitle>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-6">
              {/* Profile */}
              <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-100">
                  <span className="text-2xl font-bold text-violet-600">
                    {selectedCustomer.user_name?.[0]?.toUpperCase() || '?'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="truncate text-lg font-semibold">{selectedCustomer.user_name}</h3>
                  <p className="truncate text-slate-500">{selectedCustomer.user_email}</p>
                  {selectedCustomer.phone && (
                    <p className="text-sm text-slate-400">{selectedCustomer.phone}</p>
                  )}
                </div>
                {tierBadge(selectedCustomer.tier, 'text-base px-4 py-2')}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl bg-violet-50 p-4 text-center">
                  <p className="text-2xl font-bold text-violet-600 tnum">
                    {(selectedCustomer.current_balance || 0).toLocaleString('es-MX')}
                  </p>
                  <p className="text-sm text-violet-600">Saldo actual</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-600 tnum">
                    +{(selectedCustomer.lifetime_earned || 0).toLocaleString('es-MX')}
                  </p>
                  <p className="text-sm text-emerald-600">Total ganado</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 text-center">
                  <p className="text-2xl font-bold text-slate-600 tnum">
                    -{(selectedCustomer.lifetime_redeemed || 0).toLocaleString('es-MX')}
                  </p>
                  <p className="text-sm text-slate-600">Total canjeado</p>
                </div>
              </div>

              {/* Recent Transactions */}
              <div>
                <h4 className="mb-3 font-semibold">Movimientos recientes</h4>
                {customerTransactions?.length > 0 ? (
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {customerTransactions.map((tx) => (
                      <div key={tx.id} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          tx.points > 0 ? 'bg-emerald-100' : 'bg-slate-100'
                        }`}
                        >
                          {tx.points > 0 ? (
                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-slate-600" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{tx.description}</p>
                          <p className="text-xs text-slate-400">
                            {format(new Date(tx.created_date), 'd MMM, HH:mm', { locale: es })}
                          </p>
                        </div>
                        <span className={`font-bold tnum ${tx.points > 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                          {tx.points > 0 ? '+' : ''}{tx.points}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-4 text-center text-slate-400">Sin movimientos</p>
                )}
              </div>

              <DialogFooter>
                <Button
                  onClick={() => { setShowAdjustDialog(true); }}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Ajustar puntos
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Adjust Points Dialog */}
      <Dialog open={showAdjustDialog} onOpenChange={(open) => {
        setShowAdjustDialog(open);
        if (!open) setAdjustData({ points: 0, reason: '' });
      }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar puntos</DialogTitle>
            <DialogDescription>
              Ajuste manual de puntos para {selectedCustomer?.user_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Saldo actual</p>
              <p className="text-2xl font-bold text-violet-600 tnum">
                {(selectedCustomer?.current_balance || 0).toLocaleString('es-MX')} puntos
              </p>
            </div>

            <div>
              <Label>Puntos a ajustar (positivo para sumar, negativo para restar)</Label>
              <Input
                type="number"
                value={adjustData.points}
                onChange={(e) => setAdjustData({ ...adjustData, points: e.target.value })}
                placeholder="0"
                className="mt-1.5"
              />
              {parseInt(adjustData.points, 10) ? (
                <p className="mt-2 text-sm">
                  Nuevo saldo:
                  <span className="ml-1 font-bold text-violet-600 tnum">
                    {((selectedCustomer?.current_balance || 0) + (parseInt(adjustData.points, 10) || 0)).toLocaleString('es-MX')} puntos
                  </span>
                </p>
              ) : null}
            </div>

            <div>
              <Label>Razón del ajuste (obligatoria)</Label>
              <Textarea
                value={adjustData.reason}
                onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                placeholder="Describe la razón del ajuste..."
                className="mt-1.5"
                rows={3}
              />
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-orange-50 p-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 text-orange-500" />
              <p className="text-sm text-orange-700">
                Este ajuste quedará registrado en la auditoría con tu nombre como responsable.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => adjustMutation.mutate()}
              disabled={!adjustData.reason.trim() || !parseInt(adjustData.points, 10) || adjustMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {adjustMutation.isPending ? 'Procesando...' : 'Confirmar ajuste'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
