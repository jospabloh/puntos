import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

// Layout de marca para las pantallas de autenticación. Dos columnas en
// desktop (formulario a la izquierda, panel de marca Puntos+ a la derecha,
// oculto en móvil). Sigue el mismo esqueleto que el resto del portafolio
// ACACIA (badge de ícono + título + subtítulo + children + footer, con un
// panel derecho de badge-pill + headline + copy), pero conserva la
// identidad visual propia de Puntos+ (logo, degradado violeta→fucsia, acento
// ámbar y copy de lealtad/recompensas).
export default function AuthLayout({
  icon: Icon,
  title,
  subtitle = null,
  footer = null,
  children,
  showSplitPanel = true,
}) {
  return (
    <div
      className={cn(
        'min-h-screen bg-white text-slate-900',
        showSplitPanel && 'lg:grid lg:grid-cols-2'
      )}
    >
      {/* Columna del formulario */}
      <div className="flex min-h-screen flex-col overflow-y-auto px-6 py-8 lg:min-h-0 lg:px-12">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 shadow-lg shadow-violet-500/30">
            <Sparkles className="h-5 w-5 text-white" />
            <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-amber-400 ring-2 ring-white" />
          </div>
          <span className="font-display text-lg font-bold text-slate-900">
            Puntos<span className="text-amber-500">+</span>
          </span>
        </Link>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <div className="mb-7 text-center">
            {Icon && (
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100">
                <Icon className="h-6 w-6 text-violet-600" aria-hidden="true" />
              </div>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
          </div>

          {children}

          {footer && <p className="mt-6 text-center text-sm text-slate-500">{footer}</p>}
        </div>

        <p className="text-center text-xs text-slate-400">Puntos+ · Lealtad y recompensas</p>
      </div>

      {/* Panel de marca (desktop) */}
      {showSplitPanel && (
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-violet-100 via-fuchsia-50 to-white lg:block">
          <div className="absolute top-1/4 -left-16 h-72 w-72 rounded-full bg-violet-200/40 blur-3xl" />
          <div className="absolute bottom-1/4 -right-16 h-64 w-64 rounded-full bg-fuchsia-200/40 blur-3xl" />

          <div className="absolute inset-0 flex flex-col justify-center px-12">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">
              Programa de lealtad · SaaS
            </span>
            <h2 className="mt-5 text-4xl font-bold leading-tight text-slate-900">
              Tu programa de lealtad,
              <br />
              <span className="text-violet-600">en un solo lugar</span>.
            </h2>
            <p className="mt-4 max-w-sm text-sm text-slate-500">
              Acumula puntos en cada compra, canjea recompensas exclusivas y disfruta
              beneficios únicos con Puntos+.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
