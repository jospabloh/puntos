import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, RefreshCw, Clock, Shield, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function QRWallet({ account, onRefreshToken }) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Calculate time left until token expires
  useEffect(() => {
    if (!account?.qr_token_expires) return;

    const calculateTimeLeft = () => {
      const expires = new Date(account.qr_token_expires).getTime();
      const now = Date.now();
      return Math.max(0, Math.floor((expires - now) / 1000));
    };

    setTimeLeft(calculateTimeLeft());
    const interval = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      if (remaining <= 0 && onRefreshToken) {
        onRefreshToken();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [account?.qr_token_expires, onRefreshToken]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRefresh = async () => {
    if (isRefreshing || !onRefreshToken) return;
    setIsRefreshing(true);
    await onRefreshToken();
    setIsRefreshing(false);
  };

  const handleCopy = () => {
    if (!account?.qr_token) return;
    navigator.clipboard.writeText(account.qr_token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate QR code URL using a public QR API
  const qrData = account?.qr_token ? 
    `LOYALTY:${account.qr_token}:${account.id}` : '';
  const qrUrl = qrData ? 
    `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}&bgcolor=ffffff&color=000000&margin=10` : '';

  const isExpired = timeLeft <= 0;
  const isExpiringSoon = timeLeft > 0 && timeLeft < 60;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative"
    >
      {/* Main QR Card */}
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-pink-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <QrCode className="h-5 w-5" />
              <span className="font-semibold">Mi QR de Puntos</span>
            </div>
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium",
              isExpired 
                ? "bg-red-500/20 text-red-100" 
                : isExpiringSoon 
                  ? "bg-yellow-500/20 text-yellow-100"
                  : "bg-white/20 text-white"
            )}>
              <Clock className="h-3 w-3" />
              {isExpired ? 'Expirado' : formatTime(timeLeft)}
            </div>
          </div>
        </div>

        {/* QR Code Area */}
        <div className="p-6">
          <div className="relative flex items-center justify-center">
            <AnimatePresence mode="wait">
              {qrUrl && !isExpired ? (
                <motion.div
                  key="qr"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative"
                >
                  <div className="p-4 bg-white rounded-2xl shadow-lg ring-1 ring-slate-100">
                    <img 
                      src={qrUrl} 
                      alt="QR Code" 
                      className="w-56 h-56 rounded-xl"
                    />
                  </div>
                  
                  {/* Decorative corners */}
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-violet-500 rounded-tl-xl" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-violet-500 rounded-tr-xl" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-violet-500 rounded-bl-xl" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-violet-500 rounded-br-xl" />
                </motion.div>
              ) : (
                <motion.div
                  key="expired"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="w-56 h-56 flex flex-col items-center justify-center bg-slate-100 rounded-2xl"
                >
                  <QrCode className="h-12 w-12 text-slate-300 mb-3" />
                  <p className="text-slate-500 text-sm font-medium">QR Expirado</p>
                  <p className="text-slate-400 text-xs">Presiona refrescar</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Token Display */}
          {account?.qr_token && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Código único</p>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copiar
                    </>
                  )}
                </button>
              </div>
              <div className="font-mono text-sm bg-slate-50 rounded-xl px-4 py-3 text-center text-slate-700 tracking-wider">
                {account.qr_token?.substring(0, 4)}-{account.qr_token?.substring(4, 8)}-{account.qr_token?.substring(8, 12)}
              </div>
            </div>
          )}

          {/* Refresh Button */}
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={cn(
              "w-full mt-6 h-12 rounded-xl font-medium transition-all",
              isExpired || isExpiringSoon
                ? "bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700"
            )}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
            {isRefreshing ? 'Actualizando...' : 'Refrescar QR'}
          </Button>

          {/* Security Note */}
          <div className="mt-4 flex items-start gap-2 text-xs text-slate-500">
            <Shield className="h-4 w-4 text-green-500 flex-shrink-0" />
            <p>
              Este código es único y expira por seguridad. 
              Muéstralo solo al cajero al momento de acumular o canjear.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}