import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store, Sparkles, ArrowRight, CheckCircle, Loader2, ArrowLeft,
  Building2, MailCheck, Gift, ShieldCheck, Crown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { createPageUrl } from '../utils';
import { TRIAL_DAYS } from '@/lib/licensePlans';

const DAY_MS = 24 * 60 * 60 * 1000;
const randomCode = (n = 6) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
};

export default function Onboarding() {
  const [user, setUser] = useState(null);
  const [invitation, setInvitation] = useState(null);
  const [step, setStep] = useState(1);
  const [path, setPath] = useState(null); // 'business' | 'customer'
  const [storeCode, setStoreCode] = useState('');
  const [biz, setBiz] = useState({ businessName: '', storeName: '', storeCode: '', phone: '' });

  useEffect(() => {
    (async () => {
      try {
        const raw = await base44.auth.me();
        const u = raw?.data ? { ...raw.data, ...raw } : raw;
        setUser(u);

        // Already onboarded? Send them home.
        if (u?.business_id || u?.role === 'business_admin' || u?.role === 'merchant') {
          // they belong to a tenant already
        }
        const accounts = await base44.entities.LoyaltyAccount.filter({ user_email: u.email });
        if (accounts.length > 0 && accounts[0].onboarding_completed && (u?.business_id || u?.role)) {
          window.location.href = createPageUrl('Home');
          return;
        }

        // Pending invitation for this email? (RLS allows reading own-email invites.)
        try {
          const invites = await base44.entities.Invitation.filter({ email: u.email, status: 'pending' });
          if (invites.length > 0) setInvitation(invites[0]);
        } catch { /* invitations optional */ }
      } catch {
        base44.auth.redirectToLogin();
      }
    })();
  }, []);

  // ── Accept an invitation to join an existing business ────────────────────
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

  // ── Customer joins a store by code ───────────────────────────────────────
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

  // ── Business owner registers a new tenant ────────────────────────────────
  const businessMutation = useMutation({
    mutationFn: async () => {
      if (!biz.businessName || !biz.storeName || !biz.storeCode) throw new Error('Completa los campos obligatorios');
      const code = biz.storeCode.toUpperCase();
      const existing = await base44.entities.Store.filter({ code });
      if (existing.length > 0) throw new Error('Ese código de tienda ya está en uso');

      const now = new Date();
      const trialEnd = new Date(Date.now() + TRIAL_DAYS * DAY_MS);
      const inviteCode = randomCode(6);

      // 1) Create the tenant.
      const business = await base44.entities.Business.create({
        name: biz.businessName,
        contact_email: user.email,
        owner_user_id: user.id,
        owner_email: user.email,
        phone: biz.phone,
        status: 'active',
        billing_status: 'trial',
        license_plan: 'starter',
        license_cycle: 'monthly',
        licensed_user_limit: 2,
        licensed_store_limit: 1,
        invite_code: inviteCode,
        invite_code_active: true,
        trial_start_at: now.toISOString(),
        trial_end_at: trialEnd.toISOString(),
        primary_color: '#7c3aed',
      });

      // 2) Create the first store under the tenant.
      const store = await base44.entities.Store.create({
        name: biz.storeName,
        code,
        business_id: business.id,
        business_name: business.name,
        merchant_id: user.id,
        merchant_name: user.full_name || user.email.split('@')[0],
        merchant_email: user.email,
        phone: biz.phone,
        status: 'active',
        points_rate: 1,
        min_purchase: 0,
        daily_earn_limit: 1000,
      });

      // 3) Loyalty account for the owner (trial tracking) — service role stamps business_id.
      try {
        await base44.functions.invoke('createLoyaltyAccount', { type: 'merchant', business: { id: business.id, name: business.name } });
      } catch { /* non-blocking */ }

      // 4) Promote the user to business admin of this tenant.
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

      // 5) Record the trial start in the license ledger.
      try {
        await base44.entities.LicenseEvent.create({
          business_id: business.id,
          business_name: business.name,
          event_type: 'trial_started',
          to_plan: 'starter',
          to_status: 'trial',
          effective_at: now.toISOString(),
          expires_at: trialEnd.toISOString(),
          actor_email: user.email,
          notes: `Prueba gratuita de ${TRIAL_DAYS} días iniciada en el alta del negocio.`,
        });
      } catch { /* best effort */ }

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

  const Shell = ({ children }) => (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden pp-shell-bg p-4">
      <div className="pointer-events-none absolute inset-0 pp-grid-texture opacity-60" />
      <div className="relative w-full max-w-lg">
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 shadow-lg shadow-violet-500/30">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <h1 className="font-display text-3xl font-bold text-slate-900">Bienvenido a Puntos<span className="text-amber-500">+</span></h1>
          <p className="mt-1 text-slate-500">Configura tu cuenta en unos pasos</p>
        </motion.div>
        {children}
      </div>
    </div>
  );

  // Invitation takes priority — a one-tap join.
  if (invitation) {
    const isAdmin = invitation.role === 'business_admin';
    return (
      <Shell>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-white p-8 shadow-xl ring-1 ring-violet-100">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100">
            <MailCheck className="h-7 w-7 text-violet-600" />
          </div>
          <h2 className="text-center font-display text-2xl font-bold text-slate-900">Tienes una invitación</h2>
          <p className="mt-2 text-center text-slate-600">
            <span className="font-semibold text-slate-900">{invitation.business_name}</span> te invitó a unirte como{' '}
            <span className="inline-flex items-center gap-1 font-semibold text-violet-700">
              {isAdmin ? <ShieldCheck className="h-4 w-4" /> : <Store className="h-4 w-4" />}
              {isAdmin ? 'Administrador' : 'Equipo / Cajero'}
            </span>
            {invitation.store_name ? ` en ${invitation.store_name}` : ''}.
          </p>
          <Button onClick={() => acceptInviteMutation.mutate()} disabled={acceptInviteMutation.isPending} className="mt-6 w-full bg-violet-600 hover:bg-violet-700">
            {acceptInviteMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uniéndote…</> : <><CheckCircle className="mr-2 h-4 w-4" />Aceptar invitación</>}
          </Button>
          <button onClick={() => setInvitation(null)} className="mt-3 w-full text-center text-sm text-slate-400 hover:text-slate-600">
            Prefiero registrarme de otra forma
          </button>
        </motion.div>
      </Shell>
    );
  }

  return (
    <Shell>
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="rounded-3xl bg-white p-8 shadow-xl">
            <h2 className="font-display text-2xl font-bold text-slate-900">¿Cómo vas a usar Puntos+?</h2>
            <p className="mt-1 mb-6 text-slate-600">Elige la opción que mejor te describe</p>
            <div className="space-y-4">
              <button onClick={() => { setPath('business'); setStep(2); }} className="pp-card-hover group w-full rounded-2xl border-2 border-slate-200 p-6 text-left">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-violet-100 text-violet-600 group-hover:bg-violet-200"><Building2 className="h-7 w-7" /></div>
                  <div className="flex-1">
                    <h3 className="font-display text-lg font-bold text-slate-900">Tengo un negocio</h3>
                    <p className="text-sm text-slate-600">Crear mi programa de lealtad y empezar la prueba de {TRIAL_DAYS} días</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-violet-600" />
                </div>
              </button>
              <button onClick={() => { setPath('customer'); setStep(2); }} className="pp-card-hover group w-full rounded-2xl border-2 border-slate-200 p-6 text-left">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-100 text-amber-600 group-hover:bg-amber-200"><Gift className="h-7 w-7" /></div>
                  <div className="flex-1">
                    <h3 className="font-display text-lg font-bold text-slate-900">Soy cliente</h3>
                    <p className="text-sm text-slate-600">Acumular puntos y canjear recompensas en mis comercios favoritos</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-amber-600" />
                </div>
              </button>
            </div>
            <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <Crown className="h-3.5 w-3.5 text-amber-400" /> ¿Te invitaron a un equipo? Inicia sesión con el correo invitado.
            </p>
          </motion.div>
        )}

        {step === 2 && path === 'customer' && (
          <motion.div key="s2c" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="rounded-3xl bg-white p-8 shadow-xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-amber-100"><Gift className="h-7 w-7 text-amber-600" /></div>
            <h2 className="text-center font-display text-2xl font-bold text-slate-900">Código del comercio</h2>
            <p className="mb-6 mt-1 text-center text-slate-600">Ingresa el código del comercio donde acumularás puntos</p>
            <div className="space-y-4">
              <div>
                <Label>Código del comercio</Label>
                <Input value={storeCode} onChange={(e) => setStoreCode(e.target.value.toUpperCase())} placeholder="Ej. CAFE001" maxLength={20} className="mt-1.5 text-center font-mono text-lg tracking-widest" />
                <p className="mt-2 text-center text-xs text-slate-400">Pregunta al comercio por su código único</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1"><ArrowLeft className="mr-2 h-4 w-4" />Volver</Button>
                <Button onClick={() => customerMutation.mutate(storeCode)} disabled={!storeCode || customerMutation.isPending} className="flex-1 bg-amber-500 hover:bg-amber-600">
                  {customerMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verificando…</> : <><CheckCircle className="mr-2 h-4 w-4" />Continuar</>}
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {step === 2 && path === 'business' && (
          <motion.div key="s2b" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="rounded-3xl bg-white p-8 shadow-xl">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-violet-100"><Building2 className="h-7 w-7 text-violet-600" /></div>
            <h2 className="text-center font-display text-2xl font-bold text-slate-900">Registra tu negocio</h2>
            <p className="mb-6 mt-1 text-center text-slate-600">Empieza tu prueba gratuita de {TRIAL_DAYS} días</p>
            <div className="space-y-4">
              <div>
                <Label>Nombre del negocio *</Label>
                <Input value={biz.businessName} onChange={(e) => setBiz({ ...biz, businessName: e.target.value, storeName: biz.storeName || e.target.value })} placeholder="Mi Marca" className="mt-1.5" />
              </div>
              <div>
                <Label>Nombre de tu primera tienda *</Label>
                <Input value={biz.storeName} onChange={(e) => setBiz({ ...biz, storeName: e.target.value })} placeholder="Sucursal Centro" className="mt-1.5" />
              </div>
              <div>
                <Label>Código de tienda *</Label>
                <Input value={biz.storeCode} onChange={(e) => setBiz({ ...biz, storeCode: e.target.value.toUpperCase() })} placeholder="CAFE001" maxLength={20} className="mt-1.5 font-mono" />
                <p className="mt-1 text-xs text-slate-400">Lo compartirás con tus clientes para que se unan</p>
              </div>
              <div>
                <Label>Teléfono de contacto</Label>
                <Input value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} placeholder="+52 …" className="mt-1.5" />
              </div>
              <div className="rounded-xl bg-violet-50 p-4 text-sm">
                <p className="font-medium text-violet-700">✨ Plan Starter en prueba</p>
                <p className="text-violet-600">{TRIAL_DAYS} días gratis. Sin tarjeta. Cancela cuando quieras.</p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1"><ArrowLeft className="mr-2 h-4 w-4" />Volver</Button>
                <Button onClick={() => businessMutation.mutate()} disabled={!biz.businessName || !biz.storeName || !biz.storeCode || businessMutation.isPending} className="flex-1 bg-violet-600 hover:bg-violet-700">
                  {businessMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creando…</> : <><CheckCircle className="mr-2 h-4 w-4" />Crear negocio</>}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}
