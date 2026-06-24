import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequirePage } from '@/lib/useCurrentUser';
import { ROLES } from '@/lib/rbac';
import { motion } from 'framer-motion';
import { 
  Store, 
  Plus, 
  Search, 
  MapPin, 
  Phone,
  Edit,
  Trash2,
  ArrowLeft,
  MoreVertical,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

export default function AdminStores() {
  const { user, role, ready } = useRequirePage('AdminStores');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [storeToDelete, setStoreToDelete] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    city: '',
    state: '',
    phone: '',
    status: 'active',
    points_rate: 1,
    min_purchase: 0,
    daily_earn_limit: 1000
  });
  const queryClient = useQueryClient();

  // Tenant scoping: owner sees everything ({}), business_admin only their business.
  const scope = role === ROLES.OWNER ? {} : { business_id: user?.business_id };
  const scopeKey = role === ROLES.OWNER ? 'all' : user?.business_id;

  // Fetch stores
  const { data: stores, isLoading } = useQuery({
    queryKey: ['allStores', scopeKey],
    queryFn: () => base44.entities.Store.filter(scope, '-created_date'),
    enabled: !!user,
  });

  // Create/Update mutation.
  // The store `code` is generated server-side (unique) and is immutable once set —
  // customers join by it — so it is never sent from the client.
  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editingStore) {
        const { code, ...rest } = data; // eslint-disable-line no-unused-vars
        return base44.entities.Store.update(editingStore.id, rest);
      }
      const { code, ...rest } = data; // eslint-disable-line no-unused-vars
      const res = await base44.functions.invoke('createStore', rest);
      if (!res?.data?.success) throw new Error(res?.data?.error || 'No se pudo crear la tienda');
      return res.data.store;
    },
    onSuccess: (store) => {
      queryClient.invalidateQueries(['allStores']);
      setShowDialog(false);
      setEditingStore(null);
      resetForm();
      if (editingStore) toast.success('Tienda actualizada');
      else toast.success(`Tienda creada · código ${store?.code || ''}`);
    },
    onError: (e) => {
      toast.error(e?.message || 'Error al guardar la tienda');
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Store.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['allStores']);
      setStoreToDelete(null);
      toast.success('Tienda eliminada');
    },
    onError: (e) => {
      toast.error(e?.message || 'Error al eliminar la tienda');
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      address: '',
      city: '',
      state: '',
      phone: '',
      status: 'active',
      points_rate: 1,
      min_purchase: 0,
      daily_earn_limit: 1000
    });
  };

  const handleEdit = (store) => {
    setEditingStore(store);
    setFormData({
      name: store.name || '',
      code: store.code || '',
      address: store.address || '',
      city: store.city || '',
      state: store.state || '',
      phone: store.phone || '',
      status: store.status || 'active',
      points_rate: store.points_rate || 1,
      min_purchase: store.min_purchase || 0,
      daily_earn_limit: store.daily_earn_limit || 1000
    });
    setShowDialog(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  // Filter stores
  const q = searchQuery.toLowerCase();
  const filteredStores = stores?.filter(store =>
    store.name?.toLowerCase().includes(q) ||
    store.code?.toLowerCase().includes(q) ||
    store.city?.toLowerCase().includes(q)
  ) || [];

  if (!ready) {
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to={createPageUrl('AdminDashboard')}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Tiendas</h1>
                <p className="text-slate-500 text-sm">{filteredStores.length} tiendas registradas</p>
              </div>
            </div>
            <Button 
              onClick={() => { resetForm(); setEditingStore(null); setShowDialog(true); }}
              className="bg-violet-600 hover:bg-violet-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nueva Tienda
            </Button>
          </div>

          {/* Search */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar tiendas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-50 border-0"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 pt-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6 h-48"></CardContent>
              </Card>
            ))}
          </div>
        ) : filteredStores.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStores.map((store, index) => (
              <motion.div
                key={store.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-violet-100 flex items-center justify-center">
                          <Store className="h-6 w-6 text-violet-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900">{store.name}</h3>
                          <p className="text-sm text-slate-500">{store.code}</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Acciones de ${store.name || 'tienda'}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(store)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setStoreToDelete(store)}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="space-y-2 mb-4">
                      {store.address && (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <MapPin className="h-4 w-4 text-slate-400" />
                          {store.address}, {store.city}
                        </div>
                      )}
                      {store.phone && (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Phone className="h-4 w-4 text-slate-400" />
                          {store.phone}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                      <Badge className={
                        store.status === 'active' 
                          ? 'bg-emerald-100 text-emerald-700' 
                          : 'bg-slate-100 text-slate-700'
                      }>
                        {store.status === 'active' ? (
                          <><CheckCircle className="h-3 w-3 mr-1" /> Activa</>
                        ) : (
                          <><XCircle className="h-3 w-3 mr-1" /> Inactiva</>
                        )}
                      </Badge>
                      <span className="text-sm text-slate-500">
                        {store.points_rate || 0}pt/$10
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Store className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No hay tiendas</p>
            <p className="text-slate-400 text-sm mt-1">Crea tu primera tienda</p>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingStore ? 'Editar Tienda' : 'Nueva Tienda'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nombre</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Código {editingStore ? '' : '(automático)'}</Label>
                <Input
                  value={editingStore ? formData.code : 'Se genera al crear'}
                  readOnly
                  disabled
                  className="font-mono text-slate-500"
                />
                <p className="mt-1 text-xs text-slate-400">
                  {editingStore ? 'El código no se puede cambiar.' : 'Se asigna un código único automáticamente.'}
                </p>
              </div>
            </div>

            <div>
              <Label>Dirección</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Ciudad</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div>
                <Label>Estado (Región)</Label>
                <Input
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div>
                <Label>Estado</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activa</SelectItem>
                    <SelectItem value="inactive">Inactiva</SelectItem>
                    <SelectItem value="suspended">Suspendida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Puntos por $10</Label>
                <Input
                  type="number"
                  value={formData.points_rate}
                  onChange={(e) => setFormData({ ...formData, points_rate: parseInt(e.target.value) || 0 })}
                  min={1}
                />
              </div>
              <div>
                <Label>Compra mínima</Label>
                <Input
                  type="number"
                  value={formData.min_purchase}
                  onChange={(e) => setFormData({ ...formData, min_purchase: parseInt(e.target.value) || 0 })}
                  min={0}
                />
              </div>
              <div>
                <Label>Límite diario</Label>
                <Input
                  type="number"
                  value={formData.daily_earn_limit}
                  onChange={(e) => setFormData({ ...formData, daily_earn_limit: parseInt(e.target.value) || 0 })}
                  min={0}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!storeToDelete} onOpenChange={(open) => { if (!open) setStoreToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tienda</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que deseas eliminar la tienda &quot;{storeToDelete?.name}&quot;? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (storeToDelete) deleteMutation.mutate(storeToDelete.id); }}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}