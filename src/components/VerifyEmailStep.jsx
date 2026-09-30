import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, MailCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { friendlyAuthMessage, isCompleteOtp } from '@/lib/emailVerification';

// Paso "escribe el código que te mandamos por correo". Lo usan Register (justo
// después de crear la cuenta) y Login (cuando el correo aún no está verificado).
//
// Al verificar, inicia sesión solo con el correo/contraseña que ya tecleó la
// persona; si ese login falla, avisa y la manda a /Login en vez de dejarla
// varada. `onVerified({ needsLogin })` decide a dónde ir.
export default function VerifyEmailStep({ email, password, name, sendOnMount = false, onVerified, onCancel }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const sentRef = useRef(false);

  const resend = async ({ quiet = false } = {}) => {
    setResending(true);
    setError('');
    try {
      await base44.auth.resendOtp(email);
      if (!quiet) toast.success('Te enviamos un código nuevo');
    } catch (e) {
      setError(friendlyAuthMessage(e, 'No se pudo reenviar el código. Intenta de nuevo.'));
    } finally {
      setResending(false);
    }
  };

  // Desde Login el código pudo haberse perdido o vencido: se manda uno nuevo.
  useEffect(() => {
    if (sendOnMount && !sentRef.current) {
      sentRef.current = true;
      resend({ quiet: true });
    }
  }, []);

  const submit = async (e) => {
    e?.preventDefault();
    if (busy || !isCompleteOtp(code)) return;
    setBusy(true);
    setError('');
    try {
      await base44.auth.verifyOtp({ email, otpCode: code.trim() });
    } catch (err) {
      setError(friendlyAuthMessage(err, 'Código inválido o vencido.'));
      setBusy(false);
      return;
    }
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      // El nombre no viaja en register(): se guarda ya con sesión, sin bloquear.
      if (name?.trim()) {
        try { await base44.auth.updateMe({ full_name: name.trim() }); } catch { /* opcional */ }
      }
      toast.success('Correo verificado');
      onVerified({ needsLogin: false });
    } catch {
      toast.success('Correo verificado. Inicia sesión para continuar.');
      onVerified({ needsLogin: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-violet-100 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/30 p-4">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Enviamos un código de 6 dígitos a{' '}
          <strong className="text-slate-900 dark:text-slate-50">{email}</strong>. Escríbelo para activar tu cuenta.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex justify-center">
        <InputOTP
          maxLength={6}
          value={code}
          onChange={(v) => setCode(v.replace(/\D/g, ''))}
          onComplete={() => {}}
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="Código de verificación"
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}
          </InputOTPGroup>
        </InputOTP>
      </div>

      <Button
        type="submit"
        disabled={busy || !isCompleteOtp(code)}
        className="w-full h-12 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 shadow-lg shadow-violet-500/25 font-semibold"
      >
        {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verificando…</> : 'Verificar correo'}
      </Button>

      <div className="flex justify-between text-xs font-medium">
        <button type="button" onClick={() => resend()} disabled={resending} className="text-violet-600 hover:text-violet-700 disabled:opacity-60">
          {resending ? 'Enviando…' : 'Reenviar código'}
        </button>
        <button type="button" onClick={onCancel} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:dark:text-slate-200">
          Usar otro correo
        </button>
      </div>
    </form>
  );
}
