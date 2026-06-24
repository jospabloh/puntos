import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store, Sparkles, ArrowRight, CheckCircle, Loader2, ArrowLeft, Building2,
  MailCheck, Gift, ShieldCheck, Wallet, Megaphone, QrCode, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';
import { TRIAL_DAYS } from '@/lib/licensePlans';

/* ───────────────────────────────────────────────────────────────────────────
   All subcomponents live at MODULE scope so their identity is stable across
   renders. (Declaring them inside the page component re-creates them on every
   keystroke, which unmounts the inputs and steals focus — the bug this fixes.)
   ─────────────────────────────────────────────────────────────────────────── */

/** The signature element: a member card that builds itself as you type. */
function LoyaltyCardPreview({ brand, code, tone = 'violet', joining = false }) {
  const gradients = {
    violet: 'from-violet-600 via-violet-700 to-fuchsia-600',
    gold: 'from-amber-500 via-amber-600 to-orange-600',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 16 }}
      className="relative mx-auto w-full max-w-sm"
      style={{ perspective: 1000 }}
    >
      <div className={`relative aspect-[1.586/1] w-full overflow-hidden rounded-[1.4rem] bg-gradient-to-br ${gradients[tone]} p-5 shadow-2xl shadow-violet-900/40 ring-1 ring-white/15`}>
        {/* sheen + grain */}
        <div className="pointer-events-none absolute -right-1/4 -top-1/3 h-2/3 w-2/3 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute inset-0 pp-grid-texture opacity-[0.12]" />
        <div className="relative flex h-full flex-col justify-between text-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-white" />
              <span className="font-display text-sm font-bold tracking-tight">Puntos<span className="text-amber-300">+</span></span>
            </div>
            {/* chip */}
            <div className="h-7 w-9 rounded-md bg-gradient-to-br from-amber-200 to-amber-400 ring-1 ring-amber-100/50" />
          </div>

          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/60">
              {joining ? 'Te unes a' : 'Programa de lealtad'}
            </div>
            <div className="mt-0.5 truncate font-display text-xl font-bold leading-tight">
              {brand || (joining ? 'Tu comercio' : 'Tu negocio')}
            </div>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-white/55">Código</div>
              <div className="font-mono text-sm tracking-[0.15em] text-white/95">{code || '— — — —'}</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-[0.18em] text-white/55">Puntos</div>
              <div className="font-display text-lg font-bold tabular-nums text-amber-300">0</div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const BUSINESS_PERKS = [
  { icon: Wallet, text: 'Tarjeta digital en Apple & Google Wallet' },
  { icon: Megaphone, text: 'Campañas y multiplicadores de puntos' },
  { icon: Store, text: 'Punto de venta para todo tu equipo' },
];
const CUSTOMER_PERKS = [
  { icon: Sparkles, text: 'Acumula puntos en cada compra' },
  { icon: Gift, text: 'Canjea recompensas exclusivas' },
  { icon: QrCode, text: 'Tu tarjeta siempre en el celular' },
];

/** Left brand panel (desktop only) — immersive, holds the live card. */
function BrandPanel({ tone, brand, code, joining, perks, headline, sub }) {
  return (
    <div className="relative hidden overflow-hidden bg-[#160d2e] lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12">
      <div className="pointer-events-none absolute inset-0 pp-grid-texture opacity-20" />
      <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-violet-600/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />

      <div className="relative">
        <div className="flex items-center gap-2 text-white">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-900/50">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-bold">Puntos<span className="text-amber-400">+</span></span>
        </div>
      </div>

      <div className="relative my-8">
        <LoyaltyCardPreview brand={brand} code={code} tone={tone} joining={joining} />
      </div>

      <div className="relative">
        <h2 className="font-display text-2xl font-bold leading-tight text-white">{headline}</h2>
        <p className="mt-2 max-w-xs text-sm text-violet-200/80">{sub}</p>
        <ul className="mt-6 space-y-3">
          {perks.map((p) => {
            const Icon = p.icon;
            return (
              <li key={p.text} className="flex items-center gap-3 text-sm text-violet-100/90">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-amber-300">
                  <Icon className="h-4 w-4" />
                </span>
                {p.text}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Right-column shell: brand panel + the scrollable form area. */
function Shell({ panel, children }) {
  return (
    <div className="flex min-h-screen bg-white">
      {panel}
      <div className="relative flex flex-1 items-center justify-center overflow-y-auto px-5 py-8 sm:px-8">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}

/** Compact card shown above the form on mobile (where the panel is hidden). */
function MobileCard({ tone, brand, code, joining }) {
  return (
    <div className="mb-6 lg:hidden">
      <LoyaltyCardPreview brand={brand} code={code} tone={tone} joining={joining} />
    </div>
  );
}

function StepHeader({ step, eyebrow, title, sub }) {
  return (
    <div className="mb-6">
      {step != null && (
        <div className="mb-3 flex items-center gap-1.5">
          {[1, 2].map((n) => (
            <span key={n} className={`h-1.5 rounded-full transition-all ${n === step ? 'w-7 bg-violet-600' : n < step ? 'w-3 bg-violet-300' : 'w-3 bg-slate-200'}`} />
          ))}
          <span className="ml-2 text-xs font-medium text-slate-400">Paso {step} de 2</span>
        </div>
      )}
      {eyebrow && <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">{eyebrow}</div>}
      <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-[1.7rem]">{title}</h1>
      {sub && <p className="mt-1.5 text-sm text-slate-500">{sub}</p>}
    </div>
  );
}

function OptionCard({ icon: Icon, title, desc, accent, onClick }) {
  const tones = {
    violet: 'hover:border-violet-300 [&_.chip]:bg-violet-100 [&_.chip]:text-violet-600 group-hover:[&_.chip]:bg-violet-600 group-hover:[&_.chip]:text-white',
    gold: 'hover:border-amber-300 [&_.chip]:bg-amber-100 [&_.chip]:text-amber-600 group-hover:[&_.chip]:bg-amber-500 group-hover:[&_.chip]:text-white',
  };
  return (
    <button onClick={onClick} className={`group w-full rounded-2xl border-2 border-slate-200 p-5 text-left transition-all hover:shadow-lg hover:shadow-violet-500/10 ${tones[accent]}`}>
      <div className="flex items-center gap-4">
        <span className="chip flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors"><Icon className="h-6 w-6" /></span>
        <span className="flex-1">
          <span className="block font-display text-base font-bold text-slate-900">{title}</span>
          <span className="block text-sm text-slate-500">{desc}</span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
      </div>
    </button>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const fieldVariants = {
  initial: { opacity: 0, x: 14 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -14 },
};

/* ─────────────────────────────────────────────────────────────────────────── */

export default function Onboarding() {
  const [user, setUser] = useState(null);
  const [invitation, setInvitation] = useState(null);
  const [step, setStep] = useState(1);
  const [path, setPath] = useState(null); // 'business' | 'customer'
  const [storeCode, setStoreCode] = useState('');
  const [biz, setBiz] = useState({ businessName: '', storeName: '', storeCode: '', phone: '' });

  const setBizField = useCallback((field, value) => {
    setBiz((b) => ({ ...b, [field]: value }));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await base44.auth.me();
        const u = raw?.data ? { ...raw.data, ...raw } : raw;
        setUser(u);

        const accounts = await base44.entities.LoyaltyAccount.filter({ user_email: u.email });
        if (accounts.length > 0 && accounts[0].onboarding_completed && (u?.business_id || u?.role)) {
          window.location.href = createPageUrl('Home');
          return;
        }
        try {
          const invites = await base44.entities.Invitation.filter({ email: u.email, status: 'pending' });
          if (invites.length > 0) setInvitation(invites[0]);
        } catch { /* invitations optional */ }
      } catch {
        base44.auth.redirectToLogin();
      }
    })();
  }, []);

  const acceptInviteMutation = useMutation({
    mutationFn: async () => {
      const inv = invitation;
      const isAdmin = inv.role === 'business_admin';
      await base44.auth.updateMe({
        role: isAdmin ? 'business_admin' : 'merchant',
        data: {
          app_role: isAdmin ? 'business_admin' : 'staff',
          business_id: inv.business_id,
          business_name: inv.business_name,
          storeId: inv.store_id || undefined,
          store_id: inv.store_id || undefined,
          store_name: inv.store_name || undefined,
          merchant_role: isAdmin ? undefined : 'merchant',
          onboarding_completed: true,
        },
      });
      try { await base44.entities.Invitation.update(inv.id, { status: 'accepted', accepted_at: new Date().toISOString() }); } catch { /* best effort */ }
      return isAdmin;
    },
    onSuccess: (isAdmin) => {
      toast.success(`¡Te uniste a ${invitation.business_name}!`);
      setTimeout(() => { window.location.href = createPageUrl(isAdmin ? 'AdminDashboard' : 'MerchantPOS'); }, 900);
    },
    onError: () => toast.error('No se pudo aceptar la invitación. Intenta de nuevo.'),
  });

  const customerMutation = useMutation({
    mutationFn: async (code) => {
      const stores = await base44.entities.Store.filter({ code: code.toUpperCase() });
      if (stores.length === 0) throw new Error('Código de comercio no encontrado');
      const store = stores[0];
      if (store.status !== 'active') throw new Error('Este comercio no está activo');

      const res = await base44.functions.invoke('createLoyaltyAccount', {
        type: 'customer',
        store: { id: store.id, code: store.code, name: store.name, business_id: store.business_id, business_name: store.business_name },
      });
      if (!res?.data?.success && res?.data?.error !== 'Loyalty account already exists') {
        throw new Error(res?.data?.error || 'No se pudo crear tu cuenta');
      }
      await base44.auth.updateMe({
        role: 'customer',
        data: {
          app_role: 'customer',
          business_id: store.business_id || undefined,
          business_name: store.business_name || undefined,
          storeId: store.id,
          store_id: store.id,
          store_name: store.name,
          onboarding_completed: true,
        },
      });
      return store;
    },
    onSuccess: (store) => {
      toast.success(`¡Bienvenido al programa de ${store.business_name || store.name}!`);
      setTimeout(() => { window.location.href = createPageUrl('Home'); }, 900);
    },
    onError: (e) => toast.error(e.message),
  });

  const businessMutation = useMutation({
    mutationFn: async () => {
      if (!biz.businessName || !biz.storeName || !biz.storeCode) throw new Error('Completa los campos obligatorios');
      const res = await base44.functions.invoke('createBusiness', {
        businessName: biz.businessName,
        storeName: biz.storeName,
        storeCode: biz.storeCode.toUpperCase(),
        phone: biz.phone,
      });
      if (!res?.data?.success) throw new Error(res?.data?.error || 'No se pudo crear el negocio');
      const { business, store } = res.data;
      await base44.auth.updateMe({
        role: 'business_admin',
        data: {
          app_role: 'business_admin',
          business_id: business.id,
          business_name: business.name,
          storeId: store.id,
          store_id: store.id,
          store_name: store.name,
          onboarding_completed: true,
        },
      });
      return business;
    },
    onSuccess: () => {
      toast.success('¡Tu negocio está listo!');
      setTimeout(() => { window.location.href = createPageUrl('AdminDashboard'); }, 900);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center pp-shell-bg">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  // ── Invitation: a one-tap join ───────────────────────────────────────────
  if (invitation) {
    const isAdmin = invitation.role === 'business_admin';
    const panel = (
      <BrandPanel
        tone="violet" brand={invitation.business_name} code="" joining
        perks={isAdmin ? BUSINESS_PERKS : CUSTOMER_PERKS}
        headline="Te están esperando"
        sub={`Únete al equipo de ${invitation.business_name} y empieza de inmediato.`}
      />
    );
    return (
      <Shell panel={panel}>
        <MobileCard tone="violet" brand={invitation.business_name} joining />
        <StepHeader eyebrow="Invitación" title="Tienes una invitación" sub={`${invitation.business_name} te invitó a colaborar.`} />
        <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm">
              {isAdmin ? <ShieldCheck className="h-5 w-5" /> : <Store className="h-5 w-5" />}
            </span>
            <div>
              <div className="text-sm text-slate-500">Tu rol</div>
              <div className="font-display font-semibold text-slate-900">{isAdmin ? 'Administrador del negocio' : 'Equipo / Cajero'}{invitation.store_name ? ` · ${invitation.store_name}` : ''}</div>
            </div>
          </div>
        </div>
        <Button onClick={() => acceptInviteMutation.mutate()} disabled={acceptInviteMutation.isPending} className="mt-5 h-12 w-full bg-violet-600 text-base hover:bg-violet-700">
          {acceptInviteMutation.isPending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Uniéndote…</> : <><MailCheck className="mr-2 h-5 w-5" />Aceptar invitación</>}
        </Button>
        <button onClick={() => setInvitation(null)} className="mt-3 w-full text-center text-sm text-slate-400 transition-colors hover:text-slate-600">
          Prefiero registrarme de otra forma
        </button>
      </Shell>
    );
  }

  // Brand panel adapts to the chosen path / step.
  const tone = path === 'customer' ? 'gold' : 'violet';
  const panelBrand = path === 'customer' ? '' : biz.businessName;
  const panelCode = path === 'customer' ? storeCode : biz.storeCode;
  const panel = (
    <BrandPanel
      tone={tone} brand={panelBrand} code={panelCode} joining={path === 'customer'}
      perks={path === 'customer' ? CUSTOMER_PERKS : BUSINESS_PERKS}
      headline={path === 'customer' ? 'Tus puntos, en tu bolsillo' : 'Lealtad que hace crecer tu negocio'}
      sub={path === 'customer'
        ? 'Acumula y canjea en tus comercios favoritos, sin tarjetas de plástico.'
        : `Lanza tu programa de puntos en minutos. ${TRIAL_DAYS} días gratis, sin tarjeta.`}
    />
  );

  return (
    <Shell panel={panel}>
      <AnimatePresence mode="wait">
        {/* Step 1 — choose path */}
        {step === 1 && (
          <motion.div key="s1" variants={fieldVariants} initial="initial" animate="animate" exit="exit">
            <MobileCard tone={tone} brand={panelBrand} code={panelCode} joining={path === 'customer'} />
            <StepHeader step={1} eyebrow="Bienvenido" title="¿Cómo vas a usar Puntos+?" sub="Elige la opción que mejor te describe." />
            <div className="space-y-3">
              <OptionCard icon={Building2} accent="violet" title="Tengo un negocio"
                desc={`Crear mi programa de lealtad · prueba ${TRIAL_DAYS} días`}
                onClick={() => { setPath('business'); setStep(2); }} />
              <OptionCard icon={Gift} accent="gold" title="Soy cliente"
                desc="Acumular puntos y canjear recompensas"
                onClick={() => { setPath('customer'); setStep(2); }} />
            </div>
            <p className="mt-6 text-center text-xs text-slate-400">
              ¿Te invitaron a un equipo? Inicia sesión con el correo invitado.
            </p>
          </motion.div>
        )}

        {/* Step 2 — customer */}
        {step === 2 && path === 'customer' && (
          <motion.div key="s2c" variants={fieldVariants} initial="initial" animate="animate" exit="exit">
            <MobileCard tone="gold" brand="" code={storeCode} joining />
            <StepHeader step={2} eyebrow="Cliente" title="Únete a un comercio" sub="Ingresa el código que te dio el comercio." />
            <div className="space-y-5">
              <Field label="Código del comercio" hint="Lo encuentras en el mostrador o pregúntalo en caja.">
                <Input
                  autoFocus
                  value={storeCode}
                  onChange={(e) => setStoreCode(e.target.value.toUpperCase())}
                  placeholder="CAFE001"
                  maxLength={20}
                  className="h-14 text-center font-mono text-xl tracking-[0.3em]"
                />
              </Field>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => { setStep(1); setPath(null); }} className="h-12 flex-1"><ArrowLeft className="mr-2 h-4 w-4" />Volver</Button>
                <Button onClick={() => customerMutation.mutate(storeCode)} disabled={storeCode.length < 3 || customerMutation.isPending} className="h-12 flex-1 bg-amber-500 text-base hover:bg-amber-600">
                  {customerMutation.isPending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Verificando…</> : <>Continuar<ArrowRight className="ml-2 h-4 w-4" /></>}
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 2 — business */}
        {step === 2 && path === 'business' && (
          <motion.div key="s2b" variants={fieldVariants} initial="initial" animate="animate" exit="exit">
            <MobileCard tone="violet" brand={biz.businessName} code={biz.storeCode} />
            <StepHeader step={2} eyebrow="Negocio" title="Registra tu negocio" sub={`Empieza tu prueba gratuita de ${TRIAL_DAYS} días.`} />
            <div className="space-y-4">
              <Field label="Nombre del negocio">
                <Input autoFocus value={biz.businessName} onChange={(e) => setBizField('businessName', e.target.value)} placeholder="Café de la Esquina" className="h-11" />
              </Field>
              <Field label="Nombre de tu primera tienda">
                <Input value={biz.storeName} onChange={(e) => setBizField('storeName', e.target.value)} placeholder="Sucursal Centro" className="h-11" />
              </Field>
              <Field label="Código de tienda" hint="Lo compartirás con tus clientes para que se unan.">
                <Input value={biz.storeCode} onChange={(e) => setBizField('storeCode', e.target.value.toUpperCase())} placeholder="CAFE001" maxLength={20} className="h-11 font-mono tracking-widest" />
              </Field>
              <Field label="Teléfono de contacto (opcional)">
                <Input value={biz.phone} onChange={(e) => setBizField('phone', e.target.value)} placeholder="+52 …" className="h-11" />
              </Field>

              <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-violet-50 to-amber-50 p-3.5 ring-1 ring-violet-100">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-violet-600 shadow-sm"><Check className="h-5 w-5" /></span>
                <p className="text-sm text-slate-600"><span className="font-semibold text-slate-800">Plan Starter gratis {TRIAL_DAYS} días.</span> Sin tarjeta. Cancela cuando quieras.</p>
              </div>

              <div className="flex gap-3 pt-1">
                <Button variant="outline" onClick={() => { setStep(1); setPath(null); }} className="h-12 flex-1"><ArrowLeft className="mr-2 h-4 w-4" />Volver</Button>
                <Button onClick={() => businessMutation.mutate()} disabled={!biz.businessName || !biz.storeName || !biz.storeCode || businessMutation.isPending} className="h-12 flex-1 bg-violet-600 text-base hover:bg-violet-700">
                  {businessMutation.isPending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Creando…</> : <><CheckCircle className="mr-2 h-5 w-5" />Crear negocio</>}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}
