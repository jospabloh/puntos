import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AuthLayout({
  title,
  subtitle,
  footer,
  children,
  showSplitPanel = true,
}) {
  return (
    <div className="min-h-screen flex">
      {/* LEFT PANEL — form */}
      <div className={cn(
        'flex flex-col w-full px-6 py-10 bg-white overflow-y-auto',
        showSplitPanel && 'lg:w-[60%]'
      )}>
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 mb-10">
          <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Sparkles className="h-5 w-5 text-white" />
            <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-amber-400 ring-2 ring-white" />
          </div>
          <span className="font-display text-lg font-bold text-slate-900">
            Puntos<span className="text-amber-500">+</span>
          </span>
        </Link>

        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 leading-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-slate-500 text-sm">{subtitle}</p>}
        </div>

        {/* Form content */}
        <div className="flex-1 max-w-sm w-full mx-auto lg:mx-0">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <p className="mt-10 text-center text-sm text-slate-500 max-w-sm w-full mx-auto lg:mx-0">
            {footer}
          </p>
        )}
      </div>

      {/* RIGHT PANEL — visual (hidden on mobile) */}
      {showSplitPanel && (
        <div className="hidden lg:flex lg:w-[40%] relative overflow-hidden bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 items-center justify-center">
          {/* Blurred depth circles */}
          <div className="absolute top-1/4 -left-16 h-72 w-72 rounded-full bg-blue-200/50 blur-3xl" />
          <div className="absolute bottom-1/4 -right-16 h-64 w-64 rounded-full bg-indigo-200/40 blur-3xl" />

          {/* Center card */}
          <div className="relative z-10 flex flex-col items-center text-center px-10 max-w-sm">
            <div className="h-24 w-24 rounded-3xl bg-white/80 backdrop-blur-sm shadow-xl shadow-indigo-200/40 flex items-center justify-center mb-6">
              <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/40">
                <Sparkles className="h-7 w-7 text-white" />
                <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-amber-400 ring-2 ring-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 leading-tight mb-3">
              Tu programa de lealtad,<br />en un solo lugar
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Acumula puntos en cada compra, canjea recompensas exclusivas y disfruta beneficios únicos con Puntos+.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}