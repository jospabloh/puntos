import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { guardedUpdate, guardedDelete } from '@/lib/guardedWrite';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequirePage } from '@/lib/useCurrentUser';
import { getActiveBusinessId, getActiveBusinessName } from '@/lib/activeTenant';
import { motion } from 'framer-motion';
import {
  Store, Plus, Search, MapPin, Phone, Edit, Trash2, MoreVertical, Copy, Coins, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { PageShell, PageHeader, StatTile, StatusPill, EmptyState, Toolbar, PageLoader } from '@/components/backoffice/Kit';

const EMPTY_FORM = {
  name: '', code: '', address: '', city: '', state: '', phone: '',
  status: 'active', points_rate: 1, min_purchase: 0, daily_earn_limit: 1000,
};

const STATUS_LABEL = { active: 'Activa', inactive: 'Inactiva', suspended: 'Suspendida' };

// Client-side unique store-code generator — fallback for when the createStore
// function isn't reachable yet (Builder sync lag). Server stays authoritative
// when available.
function StoreCard({ store, index, onEdit, onDelete, onCopyCode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      className="rounded-2xl border border-slate-200/70 bg-white dark:bg-slate-900 p-5 pp-card-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
            <Store className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-display font-semibold text-slate-900 dark:text-slate-50" title={store.name}>{store.name || 'Sin nombre'}</h3>
            <button
              onClick={() => onCopyCode(store.code)}
              className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-slate-600 dark:text-slate-300 transition-colors hover:bg-violet-100 hover:text-violet-700"
              title="Copiar código"
            >
              {store.code || '—'} <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="-mr-1 shrink-0" aria-label={`Acciones de ${store.name || 'tienda'}`}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(store)}><Edit className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(store)} className="text-rose-600 focus:text-rose-600"><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
        {(store.address || store.city) && (
          <div className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" /><span className="truncate">{[store.address, store.city].filter(Boolean).join(', ')}</span></div>
        )}
        {store.phone && (
          <div className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />{store.phone}</div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
        <StatusPill status={store.status === 'active' ? 'active' : store.status === 'suspended' ? 'suspended' : 'closed'} label={STATUS_LABEL[store.status] || store.status} />
        <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-300 tnum">
          <Coins className="h-4 w-4 text-amber-500" />{store.points_rate || 0} pt / $10
        </span>
      </div>
    </motion.div>
  );
}

export default function AdminStores() {
  const { user, role, ready } = useRequirePage('AdminStores');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [storeToDelete, setStoreToDelete] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const queryClient = useQueryClient();

  const activeBusinessId = getActiveBusinessId(user);
  const scope = { business_id: activeBusinessId };
  const scopeKey = activeBusinessId || 'none';

  const { data: stores, isLoading } = useQuery({
    queryKey: ['allStores', scopeKey],
    queryFn: () => base44.entities.Store.filter(scope, '-created_date'),
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editingStore) {
        const { code, ...rest } = data;  
        return guardedUpdate('Store', editingStore.id, rest);
      }
      const { code, ...rest } = data;  
      // createStore is the ONLY create path: it assigns the unique, server-
      // authoritative `code` and (since the Module 3 pass) re-checks
      // `stores:create` and the billing gate. The old client-side fallback —
      // which generated a code by racing a filter() and wrote the Store
      // directly — was removed: it bypassed the capability check entirely, and
      // it could not help anyway, since a browser that cannot reach one
      // backend function cannot reach another.
      const res = await base44.functions.invoke('createStore', {
        ...rest,
        business_id: activeBusinessId,
        business_name: getActiveBusinessName(user),
      });
      const body = res?.data;
      if (!body?.success) {
        throw new Error(
          body?.error === 'write_blocked'
            ? 'Tu cuenta es de solo lectura. Regulariza tu licencia para crear tiendas.'
            : body?.error === 'forbidden'
              ? 'No tienes permiso para crear tiendas.'
              : body?.error || 'No se pudo crear la tienda',
        );
      }
      return body.store;
    },
    onSuccess: (store) => {
      queryClient.invalidateQueries({ queryKey: ['allStores'] });
      setShowDialog(false);
      setEditingStore(null);
      setFormData(EMPTY_FORM);
      if (editingStore) toast.success('Tienda actualizada');
      else toast.success(`Tienda creada · código ${store?.code || ''}`);
    },
    onError: (e) => toast.error(e?.message || 'Error al guardar la tienda'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => guardedDelete('Store', id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allStores'] });
      setStoreToDelete(null);
      toast.success('Tienda eliminada');
    },
    onError: (e) => toast.error(e?.message || 'Error al eliminar la tienda'),
  });

  const handleEdit = (store) => {
    setEditingStore(store);
    setFormData({
      name: store.name || '', code: store.code || '', address: store.address || '',
      city: store.city || '', state: store.state || '', phone: store.phone || '',
      status: store.status || 'active', points_rate: store.points_rate || 1,
      min_purchase: store.min_purchase || 0, daily_earn_limit: store.daily_earn_limit || 1000,
    });
    setShowDialog(true);
  };

  const openNew = () => { setFormData(EMPTY_FORM); setEditingStore(null); setShowDialog(true); };
  const handleSubmit = (e) => { e.preventDefault(); saveMutation.mutate(formData); };
  const copyCode = (code) => { if (!code) return; try { navigator.clipboard.writeText(code); toast.success('Código copiado'); } catch { /* ignore */ } };
  const setF = (patch) => setFormData((f) => ({ ...f, ...patch }));

  const q = searchQuery.toLowerCase();
  const allStores = stores || [];
  const filteredStores = allStores.filter((s) =>
    s.name?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q) || s.city?.toLowerCase().includes(q),
  );
  const activeCount = allStores.filter((s) => s.status === 'active').length;
  const avgRate = allStores.length ? Math.round((allStores.reduce((a, s) => a + (s.points_rate || 0), 0) / allStores.length) * 10) / 10 : 0;

  if (!ready) return <PageLoader />;

  return (
    <PageShell>
      <PageHeader
        icon={Store}
        eyebrow="Operación"
        title="Tiendas"
        description="Sucursales donde tus clientes acumulan y canjean puntos."
        actions={<Button onClick={openNew} className="bg-violet-600 hover:bg-violet-700"><Plus className="mr-2 h-4 w-4" />Nueva tienda</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Tiendas" value={allStores.length} icon={Store} tone="violet" loading={isLoading} />
        <StatTile label="Activas" value={activeCount} icon={CheckCircle2} tone="emerald" loading={isLoading} />
        <StatTile label="Puntos prom. / $10" value={avgRate} icon={Coins} tone="gold" loading={isLoading} />
      </div>

      <Toolbar>
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <Input placeholder="Buscar por nombre, código o ciudad…" aria-label="Buscar tiendas" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-10" />
        </div>
      </Toolbar>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-200/70 bg-white dark:bg-slate-900" />)}
        </div>
      ) : filteredStores.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredStores.map((store, i) => (
            <StoreCard key={store.id} store={store} index={i} onEdit={handleEdit} onDelete={setStoreToDelete} onCopyCode={copyCode} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Store}
          title={allStores.length ? 'Sin resultados' : 'Aún no tienes tiendas'}
          description={allStores.length ? 'Ninguna tienda coincide con tu búsqueda.' : 'Crea tu primera tienda y comparte su código con tus clientes.'}
          action={!allStores.length && <Button onClick={openNew} className="bg-violet-600 hover:bg-violet-700"><Plus className="mr-2 h-4 w-4" />Nueva tienda</Button>}
        />
      )}

      {/* Create / Edit dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editingStore ? 'Editar tienda' : 'Nueva tienda'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nombre</Label>
                <Input value={formData.name} onChange={(e) => setF({ name: e.target.value })} required autoFocus />
              </div>
              <div>
                <Label>Código {editingStore ? '' : '(automático)'}</Label>
                <Input value={editingStore ? formData.code : 'Se genera al crear'} readOnly disabled className="font-mono text-slate-500 dark:text-slate-400" />
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{editingStore ? 'El código no se puede cambiar.' : 'Se asigna un código único.'}</p>
              </div>
            </div>
            <div>
              <Label>Dirección</Label>
              <Input value={formData.address} onChange={(e) => setF({ address: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Ciudad</Label><Input value={formData.city} onChange={(e) => setF({ city: e.target.value })} /></div>
              <div><Label>Estado / Región</Label><Input value={formData.state} onChange={(e) => setF({ state: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Teléfono</Label><Input value={formData.phone} onChange={(e) => setF({ phone: e.target.value })} /></div>
              <div>
                <Label>Estado de la tienda</Label>
                <Select value={formData.status} onValueChange={(v) => setF({ status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activa</SelectItem>
                    <SelectItem value="inactive">Inactiva</SelectItem>
                    <SelectItem value="suspended">Suspendida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Puntos / $10</Label><Input type="number" value={formData.points_rate} onChange={(e) => setF({ points_rate: parseInt(e.target.value) || 0 })} min={1} /></div>
              <div><Label>Compra mínima</Label><Input type="number" value={formData.min_purchase} onChange={(e) => setF({ min_purchase: parseInt(e.target.value) || 0 })} min={0} /></div>
              <div><Label>Límite diario</Label><Input type="number" value={formData.daily_earn_limit} onChange={(e) => setF({ daily_earn_limit: parseInt(e.target.value) || 0 })} min={0} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveMutation.isPending} className="bg-violet-600 hover:bg-violet-700">{saveMutation.isPending ? 'Guardando…' : 'Guardar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!storeToDelete} onOpenChange={(open) => { if (!open) setStoreToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tienda</AlertDialogTitle>
            <AlertDialogDescription>¿Seguro que deseas eliminar &quot;{storeToDelete?.name}&quot;? Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (storeToDelete) deleteMutation.mutate(storeToDelete.id); }} disabled={deleteMutation.isPending} className="bg-rose-600 hover:bg-rose-700">{deleteMutation.isPending ? 'Eliminando…' : 'Eliminar'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
