import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Sparkles } from 'lucide-react';

export default function TrialBanner({ trialEndDate }) {
  if (!trialEndDate) return null;

  const now = new Date();
  const endDate = new Date(trialEndDate);
  const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

  if (daysRemaining <= 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 px-4 py-3 shadow-lg"
    >
      <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">MODO DEMO / TRIAL</p>
            <p className="text-white/90 text-xs">
              Te quedan <span className="font-bold">{daysRemaining} días</span> de prueba
            </p>
          </div>
        </div>
        <Clock className="h-5 w-5 text-white/80" />
      </div>
    </motion.div>
  );
}