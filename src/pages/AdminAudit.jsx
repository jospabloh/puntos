import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  Activity, 
  Search, 
  ArrowLeft,
  Filter,
  AlertTriangle,
  CheckCircle,
  XCircle,
  User,
  Store,
  Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const actionConfig = {
  earn: { label: 'Acumular', color: 'bg-emerald-100 text-emerald-700' },
  burn: { label: 'Canjear', color: 'bg-violet-100 text-violet-700' },
  adjust: { label: 'Ajuste', color: 'bg-blue-100 text-blue-700' },
  reverse: { label: 'Reversión', color: 'bg-orange-100 text-orange-700' },
  create: { label: 'Crear', color: 'bg-slate-100 text-slate-700' },
  update: { label: 'Actualizar', color: 'bg-slate-100 text-slate-700' },
  delete: { label: 'Eliminar', color: 'bg-red-100 text-red-700' },
  login: { label: 'Login', color: 'bg-slate-100 text-slate-700' },
  view: { label: 'Ver', color: 'bg-slate-100 text-slate-700' },
  export: { label: 'Exportar', color: 'bg-slate-100 text-slate-700' },
};

const roleConfig = {
  customer: { label: 'Cliente', color: 'bg-blue-50 text-blue-600' },
  merchant: { label: 'Comercio', color: 'bg-purple-50 text-purple-600' },
  admin: { label: 'Admin', color: 'bg-red-50 text-red-600' },
  system: { label: 'Sistema', color: 'bg-slate-50 text-slate-600' },
};

export default function AdminAudit() {
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

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

  // Fetch audit logs
  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ['auditLogs'],
    queryFn: () => base44.entities.AuditLog.list('-created_date', 500),
    enabled: !!user,
  });

  // Filter logs
  const filteredLogs = auditLogs?.filter(log => {
    const matchesSearch = 
      log.actor_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.payload_summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entity_type?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    const matchesRole = roleFilter === 'all' || log.actor_role === roleFilter;
    const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
    return matchesSearch && matchesAction && matchesRole && matchesStatus;
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
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <Link to={createPageUrl('AdminDashboard')}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Auditoría</h1>
              <p className="text-slate-500 text-sm">{filteredLogs.length} registros</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-50 border-0"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Acción" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="earn">Acumular</SelectItem>
                <SelectItem value="burn">Canjear</SelectItem>
                <SelectItem value="adjust">Ajuste</SelectItem>
                <SelectItem value="reverse">Reversión</SelectItem>
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="merchant">Comercio</SelectItem>
                <SelectItem value="customer">Cliente</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="success">Éxito</SelectItem>
                <SelectItem value="failed">Fallido</SelectItem>
                <SelectItem value="blocked">Bloqueado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 pt-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : filteredLogs.length > 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-[180px]">Fecha</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log, index) => (
                  <motion.tr
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.02 }}
                    className="hover:bg-slate-50"
                  >
                    <TableCell className="font-mono text-xs text-slate-500">
                      {format(new Date(log.created_date), "dd/MM/yy HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center">
                          <User className="h-3 w-3 text-slate-500" />
                        </div>
                        <span className="text-sm truncate max-w-[150px]" title={log.actor_email}>
                          {log.actor_email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={roleConfig[log.actor_role]?.color || 'bg-slate-100'}>
                        {roleConfig[log.actor_role]?.label || log.actor_role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={actionConfig[log.action]?.color || 'bg-slate-100'}>
                        {actionConfig[log.action]?.label || log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {log.entity_type}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <span className="text-sm text-slate-600 truncate block" title={log.payload_summary}>
                        {log.payload_summary || '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {log.status === 'success' && (
                        <span className="flex items-center gap-1 text-emerald-600 text-sm">
                          <CheckCircle className="h-4 w-4" />
                          Éxito
                        </span>
                      )}
                      {log.status === 'failed' && (
                        <span className="flex items-center gap-1 text-red-600 text-sm">
                          <XCircle className="h-4 w-4" />
                          Fallido
                        </span>
                      )}
                      {log.status === 'blocked' && (
                        <span className="flex items-center gap-1 text-orange-600 text-sm">
                          <AlertTriangle className="h-4 w-4" />
                          Bloqueado
                        </span>
                      )}
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Activity className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No hay registros</p>
          </div>
        )}
      </div>
    </div>
  );
}