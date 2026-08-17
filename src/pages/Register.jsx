import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, User } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AuthLayout from '@/components/AuthLayout';
import GoogleIcon from '@/components/GoogleIcon';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await base44.auth.register(email, password, name);
      window.location.href = '/';
    } catch (err) {
      setError(err.message || 'No se pudo crear la cuenta. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    base44.auth.loginWithProvider('google', '/');
  };

  return (
    <AuthLayout
      title="Crea tu cuenta"
      subtitle="Únete a Puntos+ y empieza a acumular recompensas hoy."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to="/Login" className="font-semibold text-violet-600 hover:text-violet-700">
            Inicia sesión
          </Link>
        </>
      }
    >
      {/* Google OAuth */}
      <Button
        type="button"
        variant="outline"
        className="w-full h-12 flex items-center justify-center gap-3 border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium"
        onClick={handleGoogle}
      >
        <GoogleIcon className="h-5 w-5" />
        Registrarse con Google
      </Button>

      {/* Divider */}
      <div className="my-5 flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs text-slate-400 font-medium">O</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {/* Registration form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="relative">
          <Label htmlFor="register-name" className="sr-only">Nombre completo</Label>
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            id="register-name"
            type="text"
            placeholder="Tu nombre completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 pl-10 border-slate-200 focus:border-violet-400"
          />
        </div>

        <div className="relative">
          <Label htmlFor="register-email" className="sr-only">Correo electrónico</Label>
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            id="register-email"
            type="email"
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-12 pl-10 border-slate-200 focus:border-violet-400"
          />
        </div>

        <div className="relative">
          <Label htmlFor="register-password" className="sr-only">Contraseña</Label>
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            id="register-password"
            type="password"
            placeholder="Crea una contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-12 pl-10 border-slate-200 focus:border-violet-400"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-12 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-700 hover:to-fuchsia-700 shadow-lg shadow-violet-500/25 font-semibold"
        >
          {loading ? 'Creando cuenta...' : 'Crear cuenta'}
        </Button>
      </form>
    </AuthLayout>
  );
}