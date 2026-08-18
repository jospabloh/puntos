import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, RefreshCw, Clock, Shield, Copy, Check, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

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

  const handleAddToGoogleWallet = async () => {
    try {
      toast.loading('Generando pase de Google Wallet...');
      const response = await base44.functions.invoke('createGoogleWalletPass', {});
      toast.dismiss();
      
      if (response.data?.url) {
        try {
          const parsed = new URL(response.data.url);
          if (parsed.protocol !== 'https:' || parsed.hostname !== 'pay.google.com') {
            throw new Error('URL de destino no es de confianza');
          }
          window.open(parsed.href, '_blank', 'noopener,noreferrer');
        } catch {
          toast.error('La URL del pase no es válida o no es de confianza.');
        }
      }
    } catch (error) {
      toast.dismiss();
      toast.error('Error al generar el pase: ' + error.message);
    }
  };

  const handleAddToAppleWallet = async () => {
    try {
      toast.loading('Generando pase de Apple Wallet...');
      const response = await base44.functions.invoke('createAppleWalletPass', {});
      toast.dismiss();
      
      // Create blob from response
      const blob = new Blob([response.data], { type: 'application/vnd.apple.pkpass' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `puntos_plus_${account.id.slice(0, 8)}.pkpass`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('Pase descargado. Ábrelo para agregarlo a Apple Wallet');
    } catch (error) {
      toast.dismiss();
      toast.error('Error al generar el pase: ' + error.message);
    }
  };

  // Generate QR code URL using a public QR API
  const qrData = account?.qr_token ?
    `LOYALTY:${account.qr_token}` : '';
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
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-slate-200/50 overflow-hidden">
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
                  <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-lg ring-1 ring-slate-100">
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
                  className="w-56 h-56 flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-2xl"
                >
                  <QrCode className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">QR Expirado</p>
                  <p className="text-slate-400 dark:text-slate-500 text-xs">Presiona refrescar</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Token Display */}
          {account?.qr_token && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Código único</p>
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
              <div className="font-mono text-sm bg-slate-50 dark:bg-slate-900 rounded-xl px-4 py-3 text-center text-slate-700 dark:text-slate-200 tracking-wider">
                {account.qr_token?.substring(0, 4)}-{account.qr_token?.substring(4, 8)}-{account.qr_token?.substring(8, 12)}
              </div>
            </div>
          )}

          {/* Wallet Buttons */}
          <div className="mt-6 space-y-3">
            <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 text-center">
              Agregar a tu cartera digital
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={handleAddToGoogleWallet}
                variant="outline"
                className="h-12 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-violet-300 hover:bg-violet-50 transition-all"
              >
                <Wallet className="h-4 w-4 mr-2 text-violet-600" />
                <span className="text-sm font-medium">Google</span>
              </Button>

              <Button
                onClick={handleAddToAppleWallet}
                variant="outline"
                className="h-12 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-slate-400 hover:dark:border-slate-500 hover:bg-slate-50 hover:dark:bg-slate-900 transition-all"
              >
                <Wallet className="h-4 w-4 mr-2 text-slate-700 dark:text-slate-200" />
                <span className="text-sm font-medium">Apple</span>
              </Button>
            </div>
          </div>

          {/* Refresh Button */}
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={cn(
              "w-full mt-4 h-12 rounded-xl font-medium transition-all",
              isExpired || isExpiringSoon
                ? "bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white"
                : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 hover:dark:bg-slate-700 text-slate-700 dark:text-slate-200"
            )}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
            {isRefreshing ? 'Actualizando...' : 'Refrescar QR'}
          </Button>

          {/* Security Note */}
          <div className="mt-4 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
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