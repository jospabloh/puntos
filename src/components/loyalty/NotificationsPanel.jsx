import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift, TrendingUp, Sparkles, Clock, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function NotificationsPanel({ isOpen, onClose, notifications }) {
  if (!isOpen) return null;

  const getIcon = (type) => {
    switch (type) {
      case 'earn': return TrendingUp;
      case 'burn': return Gift;
      case 'campaign': return Sparkles;
      default: return CheckCircle;
    }
  };

  const getColor = (type) => {
    switch (type) {
      case 'earn': return 'text-green-600 bg-green-100';
      case 'burn': return 'text-pink-600 bg-pink-100';
      case 'campaign': return 'text-violet-600 bg-violet-100';
      default: return 'text-slate-600 bg-slate-100';
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Notificaciones</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="rounded-full"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto h-full pb-20">
            {notifications?.length > 0 ? (
              <div className="p-4 space-y-3">
                {notifications.map((notif, index) => {
                  const Icon = getIcon(notif.type);
                  return (
                    <motion.div
                      key={notif.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={cn(
                        "p-4 rounded-2xl border transition-all hover:shadow-md",
                        notif.read ? 'bg-slate-50 border-slate-200' : 'bg-white border-violet-200'
                      )}
                    >
                      <div className="flex gap-3">
                        <div className={cn("h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0", getColor(notif.type))}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 mb-1">
                            {notif.title}
                          </p>
                          <p className="text-sm text-slate-600 mb-2">
                            {notif.message}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <Clock className="h-3 w-3" />
                            {formatTimeAgo(notif.created_date)}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-96 px-4">
                <div className="h-20 w-20 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                  <CheckCircle className="h-10 w-10 text-slate-300" />
                </div>
                <p className="text-slate-500 font-medium">No hay notificaciones</p>
                <p className="text-slate-400 text-sm text-center mt-1">
                  Te avisaremos cuando haya novedades
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  
  if (seconds < 60) return 'Hace un momento';
  if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)} h`;
  if (seconds < 604800) return `Hace ${Math.floor(seconds / 86400)} días`;
  return new Date(date).toLocaleDateString('es-MX');
}