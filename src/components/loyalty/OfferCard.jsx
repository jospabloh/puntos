import React from 'react';
import { motion } from 'framer-motion';
import { Gift, Star, ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const categoryConfig = {
  food: { icon: '🍽️', label: 'Comida', color: 'bg-orange-100 text-orange-700' },
  shopping: { icon: '🛍️', label: 'Compras', color: 'bg-pink-100 text-pink-700' },
  travel: { icon: '✈️', label: 'Viajes', color: 'bg-blue-100 text-blue-700' },
  entertainment: { icon: '🎬', label: 'Entretenimiento', color: 'bg-purple-100 text-purple-700' },
  services: { icon: '🔧', label: 'Servicios', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200' },
  other: { icon: '🎁', label: 'Otro', color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200' }
};

export default function OfferCard({ 
  offer, 
  userBalance = 0, 
  onRedeem, 
  index = 0,
  isRecommended = false,
  recommendationReason = ''
}) {
  const category = categoryConfig[offer.category] || categoryConfig.other;
  const canRedeem = userBalance >= offer.points_cost;
  const isLimited = offer.stock !== undefined && offer.stock !== -1;
  const isSoldOut = offer.status === 'soldout' || (isLimited && offer.stock <= 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "group relative bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300",
        "border border-slate-100 dark:border-slate-800 hover:border-violet-200"
      )}
    >
      {/* Recommended Badge */}
      {isRecommended && (
        <div className="absolute top-3 left-3 z-10">
          <Badge className="bg-gradient-to-r from-violet-600 to-pink-600 text-white border-0 shadow-lg">
            <Sparkles className="h-3 w-3 mr-1" />
            Para ti
          </Badge>
        </div>
      )}

      {/* Image */}
      <div className="relative h-40 overflow-hidden">
        {offer.image_url ? (
          <img 
            src={offer.image_url} 
            alt={offer.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-violet-100 to-pink-100 flex items-center justify-center">
            <Gift className="h-12 w-12 text-violet-300" />
          </div>
        )}
        
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

        {/* Category Badge */}
        <div className="absolute bottom-3 left-3">
          <span className={cn(
            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium",
            category.color
          )}>
            {category.icon} {category.label}
          </span>
        </div>

        {/* Value Badge */}
        {offer.value_mxn && (
          <div className="absolute bottom-3 right-3">
            <span className="bg-white/90 backdrop-blur-sm text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-full text-xs font-semibold">
              Valor: ${offer.value_mxn.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-slate-900 dark:text-slate-50 mb-1 line-clamp-1">
          {offer.title}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">
          {offer.short_description || offer.description}
        </p>

        {/* Recommendation Reason */}
        {isRecommended && recommendationReason && (
          <p className="text-xs text-violet-600 bg-violet-50 rounded-lg px-3 py-2 mb-3">
            💡 {recommendationReason}
          </p>
        )}

        {/* Points Cost */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <Star className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-violet-600">
                {offer.points_cost.toLocaleString()}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">puntos</p>
            </div>
          </div>

          {/* Stock / Expiry */}
          <div className="text-right">
            {isLimited && !isSoldOut && (
              <p className="text-xs text-orange-600">
                Quedan {offer.stock}
              </p>
            )}
            {offer.end_date && (
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                Hasta {format(new Date(offer.end_date), "d MMM", { locale: es })}
              </p>
            )}
          </div>
        </div>

        {/* Action Button */}
        <Button
          onClick={() => onRedeem?.(offer)}
          disabled={isSoldOut || !canRedeem}
          className={cn(
            "w-full h-11 rounded-xl font-medium transition-all",
            isSoldOut 
              ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed"
              : canRedeem
                ? "bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white shadow-lg shadow-violet-500/25"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
          )}
        >
          {isSoldOut ? (
            'Agotado'
          ) : canRedeem ? (
            <>
              Canjear ahora
              <ChevronRight className="h-4 w-4 ml-1" />
            </>
          ) : (
            `Te faltan ${(offer.points_cost - userBalance).toLocaleString()} puntos`
          )}
        </Button>
      </div>
    </motion.div>
  );
}