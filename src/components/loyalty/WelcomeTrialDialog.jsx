import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Copy, CheckCircle, Store, Users, Gift, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function WelcomeTrialDialog({ isOpen, onClose, userName, daysRemaining, isMerchant = false, storeCode = null }) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    if (storeCode) {
      navigator.clipboard.writeText(storeCode);
      setCopied(true);
      toast.success('Código copiado');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative bg-gradient-to-br from-white to-violet-50 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
        >
          {/* Background decoration */}
          <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-violet-300/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-pink-300/20 blur-3xl" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 h-8 w-8 rounded-full bg-white/80 flex items-center justify-center hover:bg-white transition-colors"
          >
            <X className="h-4 w-4 text-slate-600" />
          </button>

          {/* Content */}
          <div className="relative p-8 text-center max-h-[85vh] overflow-y-auto">
            {/* Icon */}
            <div className="inline-flex h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 items-center justify-center mb-4 shadow-lg shadow-violet-500/25">
              {isMerchant ? <Store className="h-8 w-8 text-white" /> : <Sparkles className="h-8 w-8 text-white" />}
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              ¡Bienvenido{userName ? `, ${userName}` : ''}! 🎉
            </h2>

            {/* Description */}
            <p className="text-slate-600 mb-6">
              {isMerchant ? (
                <>
                  Tu comercio está en <span className="font-bold text-orange-600">modo DEMO/TRIAL</span>.
                  Tienes <span className="font-bold">{daysRemaining} días</span> para probar Puntos+.
                </>
              ) : (
                <>
                  Tu cuenta está en <span className="font-bold text-orange-600">modo DEMO/TRIAL</span>.
                  Tienes <span className="font-bold">{daysRemaining} días</span> para explorar todas las funciones.
                </>
              )}
            </p>

            {isMerchant && storeCode && (
              <>
                {/* Store Code */}
                <div className="bg-gradient-to-br from-violet-50 to-pink-50 rounded-2xl p-5 mb-6 border-2 border-violet-200">
                  <p className="text-sm font-medium text-violet-700 mb-2">Tu código de comercio:</p>
                  <div className="flex items-center gap-3 bg-white rounded-xl p-4 shadow-sm">
                    <code className="flex-1 text-2xl font-bold text-slate-900 tracking-wider">
                      {storeCode}
                    </code>
                    <Button
                      onClick={handleCopyCode}
                      size="sm"
                      variant="ghost"
                      className="h-10 w-10 p-0"
                    >
                      {copied ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <Copy className="h-5 w-5 text-violet-600" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-violet-600 mt-2">
                    Comparte este código con tus clientes para que se registren
                  </p>
                </div>

                {/* Setup Guide */}
                <div className="bg-white/80 rounded-2xl p-5 mb-6 text-left border border-slate-200">
                  <h3 className="font-bold text-slate-900 mb-4 text-center">Guía de configuración rápida</h3>
                  
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center">
                        <span className="text-sm font-bold text-violet-600">1</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-sm">Comparte tu código</p>
                        <p className="text-xs text-slate-600">Pide a tus clientes que ingresen el código <code className="bg-slate-100 px-1 rounded">{storeCode}</code> al registrarse</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-pink-100 flex items-center justify-center">
                        <span className="text-sm font-bold text-pink-600">2</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-sm">Usa el Punto de Venta</p>
                        <p className="text-xs text-slate-600">Registra compras y acumula puntos a tus clientes desde el POS</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
                        <span className="text-sm font-bold text-amber-600">3</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-sm">Revisa tus reportes</p>
                        <p className="text-xs text-slate-600">Consulta estadísticas y comportamiento de tus clientes</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                        <span className="text-sm font-bold text-emerald-600">4</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-sm">Activa tu suscripción</p>
                        <p className="text-xs text-slate-600">Antes de que termine el trial para seguir usando el sistema</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Key Features */}
                <div className="bg-white/60 rounded-2xl p-4 mb-6 space-y-2 text-left">
                  <div className="flex items-start gap-2">
                    <Store className="h-5 w-5 text-violet-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">Punto de Venta completo</p>
                      <p className="text-xs text-slate-600">Acumula y canjea puntos fácilmente</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Users className="h-5 w-5 text-pink-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">Gestión de clientes</p>
                      <p className="text-xs text-slate-600">Base de datos de tus clientes leales</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Gift className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">Ofertas personalizadas</p>
                      <p className="text-xs text-slate-600">Crea promociones para premiar a tus clientes</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <BarChart3 className="h-5 w-5 text-emerald-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">Reportes en tiempo real</p>
                      <p className="text-xs text-slate-600">Analiza el desempeño de tu programa</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {!isMerchant && (
              <div className="bg-white/60 rounded-2xl p-4 mb-6 space-y-2 text-left">
                <div className="flex items-start gap-2">
                  <div className="h-5 w-5 rounded-full bg-green-500/20 flex items-center justify-center mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                  </div>
                  <p className="text-sm text-slate-700">Acumula y canjea puntos</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="h-5 w-5 rounded-full bg-green-500/20 flex items-center justify-center mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                  </div>
                  <p className="text-sm text-slate-700">Acceso a todas las ofertas</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="h-5 w-5 rounded-full bg-green-500/20 flex items-center justify-center mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                  </div>
                  <p className="text-sm text-slate-700">Soporte completo del programa</p>
                </div>
              </div>
            )}

            {/* Action */}
            <Button
              onClick={onClose}
              className="w-full bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white shadow-lg shadow-violet-500/25"
            >
              {isMerchant ? '¡Comenzar a usar Puntos+!' : '¡Comenzar a explorar!'}
            </Button>

            <p className="text-xs text-slate-500 mt-4">
              {isMerchant 
                ? 'Verás un banner recordatorio durante el período de trial'
                : 'Recibirás información sobre planes cuando termine tu prueba'
              }
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}