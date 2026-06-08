import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Store, 
  User, 
  Sparkles,
  ArrowRight,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';

export default function Onboarding() {
  const [user, setUser] = useState(null);
  const [step, setStep] = useState(1);
  const [userType, setUserType] = useState(null); // 'merchant' or 'customer'
  const [storeCode, setStoreCode] = useState('');
  const [merchantData, setMerchantData] = useState({
    storeName: '',
    storeCode: '',
    phone: ''
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
      
      // Check if already has account
      const accounts = await base44.entities.LoyaltyAccount.filter({ user_email: userData.email });
      if (accounts.length > 0 && accounts[0].onboarding_completed) {
        window.location.href = createPageUrl('Home');
      }
    } catch (e) {
      base44.auth.redirectToLogin();
    }
  };

  // Verify store code for customers
  const verifyStoreMutation = useMutation({
    mutationFn: async (code) => {
      const stores = await base44.entities.Store.filter({ code: code.toUpperCase() });
      if (stores.length === 0) {
        throw new Error('Código de comercio no encontrado');
      }
      if (stores[0].status !== 'active') {
        throw new Error('Este comercio no está activo');
      }
      return stores[0];
    },
    onSuccess: (store) => {
      completeCustomerOnboarding(store);
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  // Complete customer onboarding
  const completeCustomerOnboarding = async (store) => {
    try {
      // Generate QR token
      const array = new Uint8Array(9);
      crypto.getRandomValues(array);
      const qrToken = Array.from(array, b => b.toString(36).padStart(2, '0')).join('').substring(0, 12).toUpperCase();
      const tokenExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      // Create loyalty account for customer
      await base44.entities.LoyaltyAccount.create({
        user_id: user.id,
        user_email: user.email,
        user_name: user.full_name || user.email.split('@')[0],
        store_id: store.id,
        store_code: store.code,
        store_name: store.name,
        status: 'active',
        tier: 'bronze',
        current_balance: 0,
        lifetime_earned: 0,
        lifetime_redeemed: 0,
        qr_token: qrToken,
        qr_token_expires: tokenExpires,
        last_activity: new Date().toISOString(),
        subscription_status: 'active',
        onboarding_completed: true
      });

      // Update user role
      await base44.auth.updateMe({ 
        role: 'user',
        data: { userType: 'customer', storeId: store.id }
      });

      toast.success('¡Bienvenido a Puntos+!');
      setTimeout(() => {
        window.location.href = createPageUrl('Home');
      }, 1000);
    } catch (error) {
      toast.error('Error al completar el registro');
    }
  };

  // Complete merchant onboarding
  const completeMerchantMutation = useMutation({
    mutationFn: async () => {
      if (!merchantData.storeName || !merchantData.storeCode) {
        throw new Error('Completa todos los campos obligatorios');
      }

      // Check if store code already exists
      const existing = await base44.entities.Store.filter({ 
        code: merchantData.storeCode.toUpperCase() 
      });
      if (existing.length > 0) {
        throw new Error('Este código de comercio ya está en uso');
      }

      // Create store
      const store = await base44.entities.Store.create({
        name: merchantData.storeName,
        code: merchantData.storeCode.toUpperCase(),
        merchant_id: user.id,
        merchant_name: user.full_name || user.email.split('@')[0],
        merchant_email: user.email,
        phone: merchantData.phone,
        status: 'active',
        points_rate: 1,
        min_purchase: 0,
        daily_earn_limit: 1000
      });

      // Create loyalty account for merchant (for trial tracking)
      const merchantArray = new Uint8Array(9);
      crypto.getRandomValues(merchantArray);
      const qrToken = Array.from(merchantArray, b => b.toString(36).padStart(2, '0')).join('').substring(0, 12).toUpperCase();
      const tokenExpires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const trialStart = new Date().toISOString();
      const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      await base44.entities.LoyaltyAccount.create({
        user_id: user.id,
        user_email: user.email,
        user_name: user.full_name || user.email.split('@')[0],
        status: 'active',
        tier: 'bronze',
        current_balance: 0,
        qr_token: qrToken,
        qr_token_expires: tokenExpires,
        subscription_status: 'trial',
        trial_start_date: trialStart,
        trial_end_date: trialEnd,
        subscription_plan: 'trial',
        onboarding_completed: true
      });

      // Update user role
      await base44.auth.updateMe({ 
        role: 'merchant',
        data: { userType: 'merchant', storeId: store.id }
      });

      // Send notification to admin
      try {
        await base44.integrations.Core.SendEmail({
          to: import.meta.env.VITE_ADMIN_NOTIFICATION_EMAIL || 'jose.herrera@acaciaco.com.mx',
          from_name: 'Puntos+ Sistema',
          subject: '🆕 Nuevo comercio registrado en Puntos+',
          body: `
            <h2>Nuevo comercio registrado</h2>
            <p><strong>Nombre:</strong> ${merchantData.storeName}</p>
            <p><strong>Código:</strong> ${merchantData.storeCode.toUpperCase()}</p>
            <p><strong>Merchant:</strong> ${user.full_name || 'No especificado'}</p>
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Trial hasta:</strong> ${new Date(trialEnd).toLocaleString('es-MX')}</p>
          `
        });
      } catch (e) {
        console.error('Error sending admin notification:', e);
      }

      return store;
    },
    onSuccess: () => {
      toast.success('¡Comercio creado exitosamente!');
      setTimeout(() => {
        window.location.href = createPageUrl('MerchantPOS');
      }, 1000);
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/25">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold gradient-text mb-2">Bienvenido a Puntos+</h1>
          <p className="text-slate-600">Configura tu cuenta en solo unos pasos</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {/* Step 1: Choose user type */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white rounded-3xl shadow-xl p-8"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-2">¿Qué tipo de cuenta necesitas?</h2>
              <p className="text-slate-600 mb-6">Selecciona la opción que mejor se adapte a ti</p>

              <div className="space-y-4">
                <button
                  onClick={() => {
                    setUserType('merchant');
                    setStep(2);
                  }}
                  className="w-full p-6 rounded-2xl border-2 border-slate-200 hover:border-violet-300 hover:shadow-lg transition-all text-left group"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-xl bg-violet-100 flex items-center justify-center group-hover:bg-violet-200 transition-colors">
                      <Store className="h-7 w-7 text-violet-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-slate-900">Soy un Comercio</h3>
                      <p className="text-sm text-slate-600">Quiero crear mi programa de lealtad</p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-violet-600" />
                  </div>
                </button>

                <button
                  onClick={() => {
                    setUserType('customer');
                    setStep(2);
                  }}
                  className="w-full p-6 rounded-2xl border-2 border-slate-200 hover:border-pink-300 hover:shadow-lg transition-all text-left group"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-xl bg-pink-100 flex items-center justify-center group-hover:bg-pink-200 transition-colors">
                      <User className="h-7 w-7 text-pink-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-slate-900">Soy un Cliente</h3>
                      <p className="text-sm text-slate-600">Quiero acumular puntos en mis compras</p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-pink-600" />
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Customer - Enter store code */}
          {step === 2 && userType === 'customer' && (
            <motion.div
              key="step2-customer"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white rounded-3xl shadow-xl p-8"
            >
              <div className="h-14 w-14 rounded-xl bg-pink-100 flex items-center justify-center mx-auto mb-4">
                <User className="h-7 w-7 text-pink-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2 text-center">Código del Comercio</h2>
              <p className="text-slate-600 mb-6 text-center">Ingresa el código del comercio donde acumularás puntos</p>

              <div className="space-y-4">
                <div>
                  <Label>Código del Comercio</Label>
                  <Input
                    value={storeCode}
                    onChange={(e) => setStoreCode(e.target.value.toUpperCase())}
                    placeholder="Ej: STORE001"
                    className="mt-1.5 text-center text-lg font-mono"
                    maxLength={20}
                  />
                  <p className="text-xs text-slate-400 mt-2 text-center">
                    Pregunta al comercio por su código único
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="flex-1"
                  >
                    Volver
                  </Button>
                  <Button
                    onClick={() => verifyStoreMutation.mutate(storeCode)}
                    disabled={!storeCode || verifyStoreMutation.isPending}
                    className="flex-1 bg-pink-600 hover:bg-pink-700"
                  >
                    {verifyStoreMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Verificando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Continuar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 2: Merchant - Enter store info */}
          {step === 2 && userType === 'merchant' && (
            <motion.div
              key="step2-merchant"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white rounded-3xl shadow-xl p-8"
            >
              <div className="h-14 w-14 rounded-xl bg-violet-100 flex items-center justify-center mx-auto mb-4">
                <Store className="h-7 w-7 text-violet-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2 text-center">Datos de tu Comercio</h2>
              <p className="text-slate-600 mb-6 text-center">Completa la información básica</p>

              <div className="space-y-4">
                <div>
                  <Label>Nombre del Comercio *</Label>
                  <Input
                    value={merchantData.storeName}
                    onChange={(e) => setMerchantData({ ...merchantData, storeName: e.target.value })}
                    placeholder="Mi Negocio"
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label>Código Único *</Label>
                  <Input
                    value={merchantData.storeCode}
                    onChange={(e) => setMerchantData({ ...merchantData, storeCode: e.target.value.toUpperCase() })}
                    placeholder="STORE001"
                    className="mt-1.5 font-mono"
                    maxLength={20}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Este código lo compartirás con tus clientes
                  </p>
                </div>

                <div>
                  <Label>Teléfono</Label>
                  <Input
                    value={merchantData.phone}
                    onChange={(e) => setMerchantData({ ...merchantData, phone: e.target.value })}
                    placeholder="+52 ..."
                    className="mt-1.5"
                  />
                </div>

                <div className="bg-violet-50 rounded-xl p-4 text-sm text-violet-700">
                  <p className="font-medium mb-1">✨ Trial gratuito de 30 días</p>
                  <p className="text-violet-600">Comienza a usar Puntos+ sin costo por un mes</p>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="flex-1"
                  >
                    Volver
                  </Button>
                  <Button
                    onClick={() => completeMerchantMutation.mutate()}
                    disabled={!merchantData.storeName || !merchantData.storeCode || completeMerchantMutation.isPending}
                    className="flex-1 bg-violet-600 hover:bg-violet-700"
                  >
                    {completeMerchantMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Crear Comercio
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}