import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, TrendingUp, Award } from 'lucide-react';
import { cn } from '@/lib/utils';

const tierConfig = {
  bronze: {
    gradient: 'from-amber-600 via-amber-500 to-yellow-400',
    shadow: 'shadow-amber-500/30',
    icon: '🥉',
    label: 'Bronce'
  },
  silver: {
    gradient: 'from-slate-400 via-slate-300 to-slate-200',
    shadow: 'shadow-slate-400/30',
    icon: '🥈',
    label: 'Plata'
  },
  gold: {
    gradient: 'from-yellow-500 via-amber-400 to-yellow-300',
    shadow: 'shadow-yellow-500/30',
    icon: '🥇',
    label: 'Oro'
  },
  platinum: {
    gradient: 'from-violet-600 via-purple-500 to-pink-400',
    shadow: 'shadow-violet-500/30',
    icon: '💎',
    label: 'Platino'
  }
};

export default function PointsCard({ account, compact = false }) {
  const tier = tierConfig[account?.tier || 'bronze'];
  const balance = account?.current_balance || 0;

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "relative overflow-hidden rounded-2xl p-4",
          `bg-gradient-to-br ${tier.gradient}`,
          `shadow-xl ${tier.shadow}`
        )}
      >
        <div className="relative z-10 flex items-center justify-between text-white">
          <div>
            <p className="text-xs opacity-80 font-medium">Mi saldo</p>
            <p className="text-2xl font-bold">{balance.toLocaleString()}</p>
            <p className="text-xs opacity-80">puntos</p>
          </div>
          <div className="text-3xl">{tier.icon}</div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -left-4 -bottom-4 h-20 w-20 rounded-full bg-white/5 blur-xl" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn(
        "relative overflow-hidden rounded-3xl p-6",
        `bg-gradient-to-br ${tier.gradient}`,
        `shadow-2xl ${tier.shadow}`
      )}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      {/* Decorative Circles */}
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-white/5 blur-2xl" />

      {/* Card Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-white/80" />
            <span className="text-white/80 text-sm font-medium">Puntos+</span>
          </div>
          <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
            <span className="text-lg">{tier.icon}</span>
            <span className="text-white text-sm font-semibold">{tier.label}</span>
          </div>
        </div>

        {/* Balance */}
        <div className="mb-8">
          <p className="text-white/70 text-sm mb-1">Saldo disponible</p>
          <motion.p 
            key={balance}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-5xl font-bold text-white tracking-tight"
          >
            {balance.toLocaleString()}
          </motion.p>
          <p className="text-white/70 text-sm mt-1">puntos</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-white/70" />
              <span className="text-white/70 text-xs">Total ganado</span>
            </div>
            <p className="text-white font-semibold">
              {(account?.lifetime_earned || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Award className="h-4 w-4 text-white/70" />
              <span className="text-white/70 text-xs">Total canjeado</span>
            </div>
            <p className="text-white font-semibold">
              {(account?.lifetime_redeemed || 0).toLocaleString()}
            </p>
          </div>
        </div>

        {/* User Name */}
        {account?.user_name && (
          <div className="mt-6 pt-4 border-t border-white/10">
            <p className="text-white/60 text-xs uppercase tracking-wider">Titular</p>
            <p className="text-white font-medium">{account.user_name}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}