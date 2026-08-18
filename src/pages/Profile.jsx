import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { isStaff } from '@/lib/rbac';
import { useTenant } from '@/lib/useTenant';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  Edit,
  Save,
  LogOut,
  Shield,
  Star,
  Bell,
  HelpCircle,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import SuspendedAccountModal from '../components/loyalty/SuspendedAccountModal';
import TrialBanner from '../components/loyalty/TrialBanner';

const tierConfig = {
  bronze: { label: 'Bronce', icon: '🥉', nextTier: 'silver', pointsNeeded: 1000 },
  silver: { label: 'Plata', icon: '🥈', nextTier: 'gold', pointsNeeded: 5000 },
  gold: { label: 'Oro', icon: '🥇', nextTier: 'platinum', pointsNeeded: 15000 },
  platinum: { label: 'Platino', icon: '💎', nextTier: null, pointsNeeded: 0 }
};

export default function Profile() {
  const [user, setUser] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ full_name: '', phone: '' });
  const [notifPrefs, setNotifPrefs] = useState({
    campaigns_enabled: true,
    offers_enabled: true,
    points_activity_enabled: true
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
      setFormData({
        full_name: userData.full_name || '',
        phone: userData.phone || ''
      });
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
  const { business, license } = useTenant(user);

  // Keep the edit form's phone in sync with the loaded account (display reads
  // account?.phone in view mode, so the form must start from the same source).
  useEffect(() => {
    if (account && !isEditing) {
      setFormData((prev) => ({
        ...prev,
        phone: account.phone || user?.phone || ''
      }));
    }
  }, [account, isEditing, user]);

  // Fetch notification preferences
  const { data: preferences } = useQuery({
    queryKey: ['notifPreferences', user?.id],
    queryFn: () => base44.entities.NotificationPreference.filter({ user_id: user?.id }),
    enabled: !!user?.id,
  });

  // Initialize or create preferences
  useEffect(() => {
    const initPreferences = async () => {
      if (user && preferences !== undefined) {
        if (preferences.length === 0) {
          // Create default preferences. Stamp business_id (Base44 keeps custom
          // fields under `user.data`) so a tenant admin can find this row when
          // sending campaign/offer notifications — see NotificationPreference's
          // RLS business_admin branch in base44/entities/NotificationPreference.jsonc.
          await base44.entities.NotificationPreference.create({
            user_id: user.id,
            user_email: user.email,
            business_id: user.data?.business_id || user.business_id || undefined,
            campaigns_enabled: true,
            offers_enabled: true,
            points_activity_enabled: true,
            email_enabled: true
          });
          queryClient.invalidateQueries({ queryKey: ['notifPreferences'] });
        } else {
          setNotifPrefs({
            campaigns_enabled: preferences[0].campaigns_enabled ?? true,
            offers_enabled: preferences[0].offers_enabled ?? true,
            points_activity_enabled: preferences[0].points_activity_enabled ?? true
          });
        }
      }
    };
    initPreferences();
  }, [user, preferences]);

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data) => {
      await base44.auth.updateMe(data);
      if (account) {
        await base44.entities.LoyaltyAccount.update(account.id, {
          user_name: data.full_name,
          phone: data.phone
        });
      }
    },
    onSuccess: () => {
      loadUser();
      queryClient.invalidateQueries({ queryKey: ['loyaltyAccount'] });
      setIsEditing(false);
      toast.success('Perfil actualizado');
    },
    onError: () => {
      toast.error('No se pudo actualizar el perfil. Intenta de nuevo.');
    }
  });

  const handleSave = () => {
    updateProfileMutation.mutate(formData);
  };

  // Update notification preferences
  const updateNotifMutation = useMutation({
    mutationFn: async ({ next }) => {
      if (!preferences?.[0]) throw new Error('Preferencias no disponibles');
      await base44.entities.NotificationPreference.update(preferences[0].id, next);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifPreferences'] });
      toast.success('Preferencias actualizadas');
    },
    onError: (_error, variables) => {
      // Revert optimistic local state
      if (variables?.previous) setNotifPrefs(variables.previous);
      toast.error('No se pudieron guardar tus preferencias. Intenta de nuevo.');
    }
  });

  const handleNotifChange = (key, value) => {
    const previous = notifPrefs;
    const next = { ...notifPrefs, [key]: value };
    setNotifPrefs(next);
    updateNotifMutation.mutate({ next, previous });
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-violet-600">Cargando...</div>
      </div>
    );
  }

  const currentTier = tierConfig[account?.tier] || tierConfig.bronze;
  const progress = currentTier.nextTier 
    ? Math.min(100, ((account?.lifetime_earned || 0) / currentTier.pointsNeeded) * 100)
    : 100;
  const isMerchant = isStaff(user);
  const isSuspended = isMerchant && license.isSuspended;
  const showTrialBanner = isMerchant && license.isTrial && business?.trial_end_at;

  return (
    <div className="min-h-screen bg-slate-50 pb-24 md:pb-8">
      {isSuspended && <SuspendedAccountModal />}
      {!isSuspended && showTrialBanner && (
        <div className="fixed top-16 left-0 right-0 z-40">
          <TrialBanner trialEndDate={business?.trial_end_at} />
        </div>
      )}
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-pink-600 px-4 pt-4 pb-24">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Link to={createPageUrl('Home')} aria-label="Volver al inicio">
              <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/10" tabIndex={-1}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white">Mi Perfil</h1>
              <p className="text-white/70 text-sm">Gestiona tu cuenta</p>
            </div>
          </div>

          {/* Profile Avatar */}
          <div className="flex flex-col items-center text-center">
            <div className="h-24 w-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-4xl mb-4 ring-4 ring-white/30">
              {currentTier.icon}
            </div>
            <h2 className="text-2xl font-bold text-white">{user.full_name || 'Usuario'}</h2>
            <p className="text-white/70">{user.email}</p>
            <Badge className="mt-2 bg-white/20 text-white border-0">
              <Star className="h-3 w-3 mr-1" />
              Miembro {currentTier.label}
            </Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 -mt-16">
        {/* Tier Progress Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="mb-6 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-slate-500">Tu nivel actual</p>
                  <p className="text-xl font-bold text-slate-900">{currentTier.icon} {currentTier.label}</p>
                </div>
                {currentTier.nextTier && (
                  <div className="text-right">
                    <p className="text-sm text-slate-500">Siguiente nivel</p>
                    <p className="font-semibold text-violet-600">
                      {tierConfig[currentTier.nextTier].icon} {tierConfig[currentTier.nextTier].label}
                    </p>
                  </div>
                )}
              </div>
              
              {currentTier.nextTier && (
                <>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 1, delay: 0.3 }}
                      className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    {(account?.lifetime_earned || 0).toLocaleString()} / {currentTier.pointsNeeded.toLocaleString()} puntos para el siguiente nivel
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Profile Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-slate-400" />
                Información Personal
              </CardTitle>
              {!isEditing && (
                <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                  <Edit className="h-4 w-4 mr-1" />
                  Editar
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="profile-full-name">Nombre completo</Label>
                {isEditing ? (
                  <Input
                    id="profile-full-name"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="mt-1.5"
                  />
                ) : (
                  <p className="text-slate-700 mt-1">{user.full_name || 'No especificado'}</p>
                )}
              </div>
              
              <div>
                <Label>Email</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <p className="text-slate-700">{user.email}</p>
                </div>
              </div>
              
              <div>
                <Label htmlFor="profile-phone">Teléfono</Label>
                {isEditing ? (
                  <Input
                    id="profile-phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+52 ..."
                    className="mt-1.5"
                  />
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <p className="text-slate-700">{account?.phone || 'No especificado'}</p>
                  </div>
                )}
              </div>

              {isEditing && (
                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsEditing(false)} className="flex-1">
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleSave} 
                    disabled={updateProfileMutation.isPending}
                    className="flex-1 bg-violet-600 hover:bg-violet-700"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Guardar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-slate-400" />
                Notificaciones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">Campañas especiales</p>
                  <p className="text-sm text-slate-500">Alertas de nuevas campañas y bonificaciones</p>
                </div>
                <Switch
                  checked={notifPrefs.campaigns_enabled}
                  onCheckedChange={(v) => handleNotifChange('campaigns_enabled', v)}
                  aria-label="Campañas especiales"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">Ofertas y promociones</p>
                  <p className="text-sm text-slate-500">Recibe alertas de nuevas ofertas</p>
                </div>
                <Switch
                  checked={notifPrefs.offers_enabled}
                  onCheckedChange={(v) => handleNotifChange('offers_enabled', v)}
                  aria-label="Ofertas y promociones"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">Movimientos de puntos</p>
                  <p className="text-sm text-slate-500">Notificaciones al ganar o canjear</p>
                </div>
                <Switch
                  checked={notifPrefs.points_activity_enabled}
                  onCheckedChange={(v) => handleNotifChange('points_activity_enabled', v)}
                  aria-label="Movimientos de puntos"
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Menu Items */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-2"
        >
          <button
            onClick={() => toast.info('Para cambiar tu contraseña, cierra sesión y usa la opción "¿Olvidaste tu contraseña?" al iniciar sesión.')}
            className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-100 hover:shadow-md transition-all"
          >
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Shield className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-slate-900">Seguridad</p>
              <p className="text-sm text-slate-500">Cambiar contraseña</p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400" />
          </button>

          <Link to={createPageUrl('Chat')}>
            <button className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-100 hover:shadow-md transition-all">
              <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center">
                <HelpCircle className="h-5 w-5 text-violet-600" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-slate-900">Ayuda</p>
                <p className="text-sm text-slate-500">Preguntas frecuentes y soporte</p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400" />
            </button>
          </Link>

          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-red-100 hover:shadow-md hover:border-red-200 transition-all"
          >
            <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
              <LogOut className="h-5 w-5 text-red-600" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-red-600">Cerrar sesión</p>
              <p className="text-sm text-red-400">Salir de tu cuenta</p>
            </div>
          </button>
        </motion.div>

        {/* Footer */}
        <div className="text-center mt-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold gradient-text">Puntos+</span>
          </div>
          <p className="text-xs text-slate-400">
            © 2026 ACACIA Consultoría en Informática y Cómputo. Todos los Derechos Reservados.
          </p>
        </div>
      </div>
    </div>
  );
}