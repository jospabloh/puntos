import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Search,
  ArrowLeft,
  MoreVertical,
  Star,
  TrendingUp,
  TrendingDown,
  Eye,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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

const tierConfig = {
  bronze: { label: 'Bronce', color: 'bg-amber-100 text-amber-700' },
  silver: { label: 'Plata', color: 'bg-slate-100 text-slate-700' },
  gold: { label: 'Oro', color: 'bg-yellow-100 text-yellow-700' },
  platinum: { label: 'Platino', color: 'bg-violet-100 text-violet-700' }
};

export default function AdminCustomers() {
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [adjustData, setAdjustData] = useState({ points: 0, reason: '' });
  const queryClient = useQueryClient();

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
  const { data: accounts, isLoading } = useQuery({
    queryKey: ['allAccounts'],
    queryFn: () => base44.entities.LoyaltyAccount.list('-created_date', 500),
    enabled: !!user,
  });

  // Fetch transactions for selected customer
  const { data: customerTransactions } = useQuery({
    queryKey: ['customerTransactions', selectedCustomer?.id],
    queryFn: () => base44.entities.PointsLedger.filter(
      { account_id: selectedCustomer?.id },
      '-created_date',
      20
    ),
    enabled: !!selectedCustomer?.id,
  });

  // Adjust points mutation
  const adjustMutation = useMutation({
    mutationFn: async () => {
      const points = parseInt(adjustData.points);
      if (!adjustData.reason.trim()) {
        throw new Error('La razón es obligatoria');
      }

      const idempotencyKey = `adjust_${selectedCustomer.id}_${Date.now()}`;
      const newBalance = selectedCustomer.current_balance + points;

      // Create ledger entry
      await base44.entities.PointsLedger.create({
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
        status: 'completed'
      });

      // Update account
      await base44.entities.LoyaltyAccount.update(selectedCustomer.id, {
        current_balance: newBalance,
        lifetime_earned: points > 0 
          ? (selectedCustomer.lifetime_earned || 0) + points 
          : selectedCustomer.lifetime_earned,
        last_activity: new Date().toISOString()
      });

      // Audit log
      await base44.entities.AuditLog.create({
        actor_id: user.id,
        actor_email: user.email,
        actor_role: 'admin',
        action: 'adjust',
        entity_type: 'PointsLedger',
        target_user_id: selectedCustomer.user_id,
        payload_summary: `${points > 0 ? '+' : ''}${points} pts: ${adjustData.reason}`,
        status: 'success'
      });

      return { points, newBalance };
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['allAccounts']);
      queryClient.invalidateQueries(['customerTransactions']);
      setShowAdjustDialog(false);
      setAdjustData({ points: 0, reason: '' });
      toast.success('Ajuste realizado correctamente');
    },
    onError: (error) => {
      toast.error(error.message || 'Error al realizar el ajuste');
    }
  });

  // Filter accounts
  const filteredAccounts = accounts?.filter(account => {
    const matchesSearch = 
      account.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.user_email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTier = tierFilter === 'all' || account.tier === tierFilter;
    return matchesSearch && matchesTier;
  }) || [];

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-violet-600">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-16 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <Link to={createPageUrl('AdminDashboard')}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Clientes</h1>
              <p className="text-slate-500 text-sm">{filteredAccounts.length} clientes registrados</p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nombre o email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-50 border-0"
              />
            </div>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Nivel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="bronze">Bronce</SelectItem>
                <SelectItem value="silver">Plata</SelectItem>
                <SelectItem value="gold">Oro</SelectItem>
                <SelectItem value="platinum">Platino</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 pt-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : filteredAccounts.length > 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Cliente</TableHead>
                  <TableHead>Nivel</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Ganados</TableHead>
                  <TableHead className="text-right">Canjeados</TableHead>
                  <TableHead>Última actividad</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.map((account) => (
                  <TableRow key={account.id} className="hover:bg-slate-50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-violet-100 flex items-center justify-center">
                          <span className="text-violet-600 font-medium">
                            {account.user_name?.[0]?.toUpperCase() || '?'}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{account.user_name || 'Sin nombre'}</p>
                          <p className="text-sm text-slate-500">{account.user_email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={tierConfig[account.tier || 'bronze'].color}>
                        <Star className="h-3 w-3 mr-1" />
                        {tierConfig[account.tier || 'bronze'].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold text-violet-600">
                      {account.current_balance?.toLocaleString() || 0}
                    </TableCell>
                    <TableCell className="text-right text-emerald-600">
                      +{account.lifetime_earned?.toLocaleString() || 0}
                    </TableCell>
                    <TableCell className="text-right text-slate-600">
                      -{account.lifetime_redeemed?.toLocaleString() || 0}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {account.last_activity 
                        ? format(new Date(account.last_activity), "d MMM, HH:mm", { locale: es })
                        : 'Nunca'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedCustomer(account)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver detalles
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { 
                            setSelectedCustomer(account); 
                            setShowAdjustDialog(true); 
                          }}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Ajustar puntos
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No hay clientes</p>
          </div>
        )}
      </div>

      {/* Customer Detail Dialog */}
      <Dialog open={!!selectedCustomer && !showAdjustDialog} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle del Cliente</DialogTitle>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-6">
              {/* Profile */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
                <div className="h-16 w-16 rounded-full bg-violet-100 flex items-center justify-center">
                  <span className="text-2xl text-violet-600 font-bold">
                    {selectedCustomer.user_name?.[0]?.toUpperCase() || '?'}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{selectedCustomer.user_name}</h3>
                  <p className="text-slate-500">{selectedCustomer.user_email}</p>
                  {selectedCustomer.phone && (
                    <p className="text-sm text-slate-400">{selectedCustomer.phone}</p>
                  )}
                </div>
                <Badge className={tierConfig[selectedCustomer.tier || 'bronze'].color + ' text-lg px-4 py-2'}>
                  {tierConfig[selectedCustomer.tier || 'bronze'].label}
                </Badge>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-violet-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-violet-600">
                    {selectedCustomer.current_balance?.toLocaleString()}
                  </p>
                  <p className="text-sm text-violet-600">Saldo actual</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-emerald-600">
                    +{selectedCustomer.lifetime_earned?.toLocaleString()}
                  </p>
                  <p className="text-sm text-emerald-600">Total ganado</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-slate-600">
                    -{selectedCustomer.lifetime_redeemed?.toLocaleString()}
                  </p>
                  <p className="text-sm text-slate-600">Total canjeado</p>
                </div>
              </div>

              {/* Recent Transactions */}
              <div>
                <h4 className="font-semibold mb-3">Movimientos recientes</h4>
                {customerTransactions?.length > 0 ? (
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {customerTransactions.map((tx) => (
                      <div key={tx.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                          tx.points > 0 ? 'bg-emerald-100' : 'bg-slate-100'
                        }`}>
                          {tx.points > 0 ? (
                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-slate-600" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{tx.description}</p>
                          <p className="text-xs text-slate-400">
                            {format(new Date(tx.created_date), "d MMM, HH:mm", { locale: es })}
                          </p>
                        </div>
                        <span className={`font-bold ${tx.points > 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                          {tx.points > 0 ? '+' : ''}{tx.points}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-slate-400 py-4">Sin movimientos</p>
                )}
              </div>

              <DialogFooter>
                <Button
                  onClick={() => { setShowAdjustDialog(true); }}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
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
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar Puntos</DialogTitle>
            <DialogDescription>
              Ajuste manual de puntos para {selectedCustomer?.user_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-xl">
              <p className="text-sm text-slate-500">Saldo actual</p>
              <p className="text-2xl font-bold text-violet-600">
                {selectedCustomer?.current_balance?.toLocaleString()} puntos
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
              {adjustData.points !== 0 && (
                <p className="text-sm mt-2">
                  Nuevo saldo: 
                  <span className="font-bold text-violet-600 ml-1">
                    {(selectedCustomer?.current_balance + parseInt(adjustData.points || 0)).toLocaleString()} puntos
                  </span>
                </p>
              )}
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

            <div className="flex items-start gap-2 p-3 bg-orange-50 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0" />
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
              disabled={!adjustData.reason.trim() || adjustData.points === 0 || adjustMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {adjustMutation.isPending ? 'Procesando...' : 'Confirmar ajuste'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}