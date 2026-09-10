import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, LogIn } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AuthLayout from '@/components/AuthLayout';
import GoogleIcon from '@/components/GoogleIcon';
import { getRememberedIdentity, clearRememberedIdentity } from '@/lib/lastIdentity';
import { consumeLoginReturn } from '@/lib/goToLogin';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remembered, setRemembered] = useState(null);

  useEffect(() => {
    setRemembered(getRememberedIdentity());
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await base44.auth.login(email, password);
      // Vuelve a donde venía el visitante (p.ej. /Onboarding?join=1), no a '/'.
      window.location.href = consumeLoginReturn();
    } catch (err) {
      setError(err.message || 'Credenciales incorrectas. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    // El segundo argumento es la ruta de retorno; misma razón que arriba.
    base44.auth.loginWithProvider('google', consumeLoginReturn());
  };

  const handleContinueAs = () => {
    base44.auth.loginWithProvider('google', '/');
  };

  const handleUseAnother = () => {
    clearRememberedIdentity();
    setRemembered(null);
  };

  const initials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  };

  const firstName = remembered?.name?.split(' ')[0] || remembered?.email?.split('@')[0] || '';

  return (
    <AuthLayout
      icon={LogIn}
      title="Bienvenido a Puntos+"
      subtitle="Inicia sesión para acceder a tu cuenta de lealtad."
      footer={
        <>
          ¿No tienes cuenta?{' '}
          <Link to="/Register" className="font-semibold text-violet-600 hover:text-violet-700">
            Regístrate
          </Link>
        </>
      }
    >
      {/* One-tap returning user card */}
      {remembered && (
        <div className="mb-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
          <div className="flex items-center gap-3 mb-3">
            {remembered.avatar ? (
              <img src={remembered.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white text-sm font-semibold">
                {initials(remembered.name || remembered.email)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              {remembered.name && <p className="text-sm font-medium text-slate-900 dark:text-slate-50 truncate">{remembered.name}</p>}
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{remembered.email}</p>
            </div>
            <GoogleIcon className="h-4 w-4" />
          </div>
          <Button
            onClick={handleContinueAs}
            className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 h-10 text-sm"
          >
            Continuar como {firstName}
          </Button>
          <button
            onClick={handleUseAnother}
            className="mt-2 w-full text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:dark:text-slate-200 text-center"
          >
            Usar otra cuenta
          </button>
        </div>
      )}

      {/* Google OAuth */}
      <Button
        type="button"
        variant="outline"
        className="w-full h-12 flex items-center justify-center gap-3 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 hover:dark:bg-slate-900 text-sm font-medium"
        onClick={handleGoogle}
      >
        <GoogleIcon className="h-5 w-5" />
        Continuar con Google
      </Button>

      {/* Divider */}
      <div className="my-5 flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">O</span>
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
      </div>

      {/* Email / password form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="relative">
          <Label htmlFor="login-email" className="sr-only">Correo electrónico</Label>
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <Input
            id="login-email"
            type="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-12 pl-10 border-slate-200 dark:border-slate-700 focus:border-violet-400"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label htmlFor="login-password" className="text-sm text-slate-600 dark:text-slate-300 font-medium">Contraseña</Label>
            <Link to="/ForgotPassword" className="text-xs text-violet-600 hover:text-violet-700 font-medium">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
            <Input
              id="login-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-12 pl-10 border-slate-200 dark:border-slate-700 focus:border-violet-400"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-12 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 shadow-lg shadow-violet-500/25 font-semibold"
        >
          {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
        </Button>
      </form>
    </AuthLayout>
  );
}