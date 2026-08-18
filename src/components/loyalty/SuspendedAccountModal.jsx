import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SuspendedAccountModal() {
  const handleContact = () => {
    window.open('https://forms.gle/jLQ4EtWmQhkSsahy9', '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-8 text-center"
      >
        {/* Icon */}
        <div className="inline-flex h-16 w-16 rounded-full bg-red-100 items-center justify-center mb-4">
          <AlertCircle className="h-8 w-8 text-red-600" />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-3">
          Cuenta Suspendida
        </h2>

        {/* Description */}
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          Tu período de prueba ha finalizado. Para reactivar tu cuenta y continuar disfrutando de Puntos+, por favor contacta con nosotros.
        </p>

        {/* Action Button */}
        <Button
          onClick={handleContact}
          className="w-full bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white shadow-lg mb-4"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Contáctanos
        </Button>

        {/* Footer */}
        <p className="text-xs text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} ACACIA Consultoría
        </p>
      </motion.div>
    </div>
  );
}