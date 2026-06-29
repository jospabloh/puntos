import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AuthLayout from '@/components/AuthLayout';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await base44.auth.sendPasswordResetEmail(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'No se pudo enviar el correo. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Recupera tu contraseña"
      subtitle="Ingresa tu correo y te enviaremos un enlace para restablecerla."
      footer={
        <>
          ¿Recordaste tu contraseña?{' '}
          <Link to="/Login" className="font-semibold text-violet-600 hover:text-violet-700">
            Inicia sesión
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="rounded-2xl bg-green-50 border border-green-200 p-6 text-center">
          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <Mail className="h-6 w-6 text-green-600" />
          </div>
          <p className="font-semibold text-green-800 mb-1">Correo enviado</p>
          <p className="text-sm text-green-700">
            Revisa tu bandeja de entrada en <strong>{email}</strong> y sigue las instrucciones.
          </p>
          <Link to="/Login" className="mt-4 inline-block text-sm font-medium text-violet-600 hover:text-violet-700">
            ← Volver al inicio de sesión
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              type="email"
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 pl-10 border-slate-200 focus:border-violet-400"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 shadow-lg shadow-violet-500/25 font-semibold"
          >
            {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}