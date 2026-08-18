import React from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  RefreshCw,
  Clock,
  AlertTriangle,
  Gift,
  Store,
  Sparkles
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const typeConfig = {
  EARN: {
    icon: TrendingUp,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    label: 'Acumulación',
    sign: '+'
  },
  BURN: {
    icon: Gift,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    label: 'Canje',
    sign: '-'
  },
  ADJUST: {
    icon: RefreshCw,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    label: 'Ajuste',
    sign: ''
  },
  EXPIRE: {
    icon: Clock,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    label: 'Expiración',
    sign: '-'
  },
  REVERSAL: {
    icon: RefreshCw,
    color: 'text-slate-600 dark:text-slate-300',
    bg: 'bg-slate-50 dark:bg-slate-900',
    border: 'border-slate-200 dark:border-slate-700',
    label: 'Reversión',
    sign: ''
  },
  BONUS: {
    icon: Sparkles,
    color: 'text-pink-600',
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    label: 'Bonus',
    sign: '+'
  }
};

export default function TransactionItem({ transaction, index = 0, showDetails = false }) {
  const config = typeConfig[transaction.type] || typeConfig.EARN;
  const Icon = config.icon;
  const isPositive = transaction.points > 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "relative overflow-hidden rounded-2xl p-4 border transition-all hover:shadow-md",
        config.bg,
        config.border
      )}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={cn(
          "flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center",
          `${config.bg} ring-4 ring-white`
        )}>
          <Icon className={cn("h-5 w-5", config.color)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-50">
                {transaction.description || config.label}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {transaction.store_name && (
                  <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Store className="h-3 w-3" />
                    {transaction.store_name}
                  </span>
                )}
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {format(new Date(transaction.created_date), "d MMM, HH:mm", { locale: es })}
                </span>
              </div>
            </div>

            {/* Points */}
            <div className="text-right flex-shrink-0">
              <p className={cn(
                "text-lg font-bold",
                isPositive ? "text-emerald-600" : "text-slate-700 dark:text-slate-200"
              )}>
                {isPositive ? '+' : ''}{transaction.points.toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">puntos</p>
            </div>
          </div>

          {/* Extra Details */}
          {showDetails && (
            <div className="mt-3 pt-3 border-t border-white/50">
              <div className="grid grid-cols-2 gap-3 text-xs">
                {transaction.amount > 0 && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Monto:</span>
                    <span className="ml-1 font-medium text-slate-700 dark:text-slate-200">
                      ${transaction.amount.toLocaleString()} {transaction.currency || 'MXN'}
                    </span>
                  </div>
                )}
                {transaction.multiplier > 1 && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Multiplicador:</span>
                    <span className="ml-1 font-medium text-violet-600">
                      x{transaction.multiplier}
                    </span>
                  </div>
                )}
                {transaction.balance_after !== undefined && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Saldo después:</span>
                    <span className="ml-1 font-medium text-slate-700 dark:text-slate-200">
                      {transaction.balance_after.toLocaleString()}
                    </span>
                  </div>
                )}
                {transaction.ticket_id && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Ticket:</span>
                    <span className="ml-1 font-mono text-slate-700 dark:text-slate-200">
                      #{transaction.ticket_id}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Risk Flag */}
          {transaction.status === 'flagged' && (
            <div className="mt-2 flex items-center gap-1 text-xs text-orange-600">
              <AlertTriangle className="h-3 w-3" />
              <span>En revisión</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}