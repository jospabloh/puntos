import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useRequirePage } from '@/lib/useCurrentUser';
import { getActiveBusinessId } from '@/lib/activeTenant';
import { motion } from 'framer-motion';
import {
  Activity,
  Search,
  AlertTriangle,
  CheckCircle,
  XCircle,
  User,
} from 'lucide-react';
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
import {
  PageShell,
  PageHeader,
  SectionCard,
  EmptyState,
  Toolbar,
  PageLoader,
} from '@/components/backoffice/Kit';

const actionConfig = {
  earn: { label: 'Acumular', color: 'bg-emerald-100 text-emerald-700' },
  burn: { label: 'Canjear', color: 'bg-violet-100 text-violet-700' },
  adjust: { label: 'Ajuste', color: 'bg-blue-100 text-blue-700' },
  reverse: { label: 'Reversión', color: 'bg-orange-100 text-orange-700' },
  create: { label: 'Crear', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200' },
  update: { label: 'Actualizar', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200' },
  delete: { label: 'Eliminar', color: 'bg-red-100 text-red-700' },
  login: { label: 'Login', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200' },
  view: { label: 'Ver', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200' },
  export: { label: 'Exportar', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200' },
};

const roleConfig = {
  customer: { label: 'Cliente', color: 'bg-blue-50 text-blue-600' },
  merchant: { label: 'Comercio', color: 'bg-purple-50 text-purple-600' },
  business_admin: { label: 'Negocio', color: 'bg-indigo-50 text-indigo-600' },
  admin: { label: 'Admin', color: 'bg-red-50 text-red-600' },
  system: { label: 'Sistema', color: 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300' },
};

function AuditStatus({ status }) {
  if (status === 'success') {
    return (
      <span className="flex items-center gap-1 text-sm text-emerald-600">
        <CheckCircle className="h-4 w-4" />
        Éxito
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="flex items-center gap-1 text-sm text-red-600">
        <XCircle className="h-4 w-4" />
        Fallido
      </span>
    );
  }
  if (status === 'blocked') {
    return (
      <span className="flex items-center gap-1 text-sm text-orange-600">
        <AlertTriangle className="h-4 w-4" />
        Bloqueado
      </span>
    );
  }
  return <span className="text-sm text-slate-400 dark:text-slate-500">—</span>;
}

function AuditRow({ log, index }) {
  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: Math.min(index * 0.02, 0.3) }}
      className="hover:bg-slate-50 hover:dark:bg-slate-900"
    >
      <TableCell className="font-mono text-xs text-slate-500 dark:text-slate-400 tnum">
        {log.created_date ? format(new Date(log.created_date), 'dd/MM/yy HH:mm:ss') : '-'}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
            <User className="h-3 w-3 text-slate-500 dark:text-slate-400" />
          </div>
          <span className="block max-w-[150px] truncate text-sm" title={log.actor_email}>
            {log.actor_email}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Badge className={roleConfig[log.actor_role]?.color || 'bg-slate-100 dark:bg-slate-800'}>
          {roleConfig[log.actor_role]?.label || log.actor_role}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge className={actionConfig[log.action]?.color || 'bg-slate-100 dark:bg-slate-800'}>
          {actionConfig[log.action]?.label || log.action}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-slate-600 dark:text-slate-300">
        {log.entity_type}
      </TableCell>
      <TableCell className="max-w-[200px]">
        <span className="block truncate text-sm text-slate-600 dark:text-slate-300" title={log.payload_summary}>
          {log.payload_summary || '-'}
        </span>
      </TableCell>
      <TableCell>
        <AuditStatus status={log.status} />
      </TableCell>
    </motion.tr>
  );
}

export default function AdminAudit() {
  const { user, role, ready } = useRequirePage('AdminAudit');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Tenant scoping: owner sees everything ({}), business_admin only their business.
  const activeBusinessId = getActiveBusinessId(user);
  const scope = { business_id: activeBusinessId };
  const scopeKey = activeBusinessId || 'none';

  // Fetch audit logs
  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ['auditLogs', scopeKey],
    queryFn: () => base44.entities.AuditLog.filter(scope, '-created_date', 500),
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

  if (!ready) return <PageLoader />;

  return (
    <PageShell>
      <PageHeader
        icon={Activity}
        eyebrow="Seguridad"
        title="Auditoría"
        description={`${filteredLogs.length} registro(s) de actividad del programa.`}
        accent="sky"
      />

      <Toolbar>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <Input
            placeholder="Buscar…"
            aria-label="Buscar registros de auditoría"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-10"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-32 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
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
          <SelectTrigger className="w-32 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <SelectValue placeholder="Rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="business_admin">Negocio</SelectItem>
            <SelectItem value="merchant">Comercio</SelectItem>
            <SelectItem value="customer">Cliente</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="success">Éxito</SelectItem>
            <SelectItem value="failed">Fallido</SelectItem>
            <SelectItem value="blocked">Bloqueado</SelectItem>
          </SelectContent>
        </Select>
      </Toolbar>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : filteredLogs.length > 0 ? (
        <SectionCard bodyClassName="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-900">
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
                  <AuditRow key={log.id} log={log} index={index} />
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      ) : (
        <EmptyState
          icon={Activity}
          title="No hay registros"
          description="No se encontraron registros de auditoría con los filtros actuales."
        />
      )}
    </PageShell>
  );
}
