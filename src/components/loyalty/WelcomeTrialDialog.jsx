import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function WelcomeTrialDialog({ isOpen, onClose, userName, daysRemaining, isMerchant = false }) {
  if (!isOpen) return null;

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
          <div className="relative p-8 text-center">
            {/* Icon */}
            <div className="inline-flex h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 items-center justify-center mb-4 shadow-lg shadow-violet-500/25">
              <Sparkles className="h-8 w-8 text-white" />
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              ¡Bienvenido{userName ? `, ${userName}` : ''}! 🎉
            </h2>

            {/* Description */}
            <p className="text-slate-600 mb-6">
              Tu cuenta está en <span className="font-bold text-orange-600">modo DEMO/TRIAL</span>.
              Tienes <span className="font-bold">{daysRemaining} días</span> para explorar todas las funciones de Puntos+.
            </p>

            {/* Features */}
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

            {/* Action */}
            <Button
              onClick={onClose}
              className="w-full bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white shadow-lg shadow-violet-500/25"
            >
              ¡Comenzar a explorar!
            </Button>

            <p className="text-xs text-slate-500 mt-4">
              Recibirás información sobre planes cuando termine tu prueba
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}