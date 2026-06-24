import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2,
  Save,
  Copy,
  RefreshCw,
  Check,
  Palette,
  ShieldAlert,
  Info,
  KeyRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  PageShell,
  PageHeader,
  SectionCard,
  PlanBadge,
  StatusPill,
  PageLoader,
} from '@/components/backoffice/Kit';
import { useRequirePage } from '@/lib/useCurrentUser';
import { useTenant } from '@/lib/useTenant';

const INDUSTRIES = [
  'Restaurante',
  'Cafetería',
  'Retail / Tienda',
  'Belleza y estética',
  'Salud y bienestar',
  'Servicios',
  'Entretenimiento',
  'Otro',
];

const COLOR_PRESETS = ['#7c3aed', '#a855f7', '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#ef4444'];

const BANNER_TONES = {
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  critical: 'border-rose-200 bg-rose-50 text-rose-800',
};

function randomCode() {
  return Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
}

const EMPTY = {
  name: '',
  legal_name: '',
  rfc: '',
  industry: '',
  contact_email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  logo_url: '',
  primary_color: '#7c3aed',
};

export default function BusinessSettings() {
  const { user, ready } = useRequirePage('BusinessSettings');
  const { business, license, isLoading, refetch, canWrite } = useTenant(user);

  const [form, setForm] = useState(EMPTY);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteActive, setInviteActive] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (business) {
      setForm({
        name: business.name || '',
        legal_name: business.legal_name || '',
        rfc: business.rfc || '',
        industry: business.industry || '',
        contact_email: business.contact_email || '',
        phone: business.phone || '',
        address: business.address || '',
        city: business.city || '',
        state: business.state || '',
        logo_url: business.logo_url || '',
        primary_color: business.primary_color || '#7c3aed',
      });
      setInviteCode(business.invite_code || '');
      setInviteActive(business.invite_code_active !== false);
    }
  }, [business]);

  const saveMutation = useMutation({
    mutationFn: (payload) => base44.entities.Business.update(business.id, payload),
    onSuccess: async () => {
      await refetch();
      toast.success('Cambios guardados');
    },
    onError: () => toast.error('No se pudieron guardar los cambios'),
  });

  if (!ready) return <PageLoader />;
  if (isLoading || !business) return <PageLoader label="Cargando negocio…" />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));

  const handleSave = () => {
    if (!canWrite) return;
    saveMutation.mutate({
      ...form,
      invite_code: inviteCode,
      invite_code_active: inviteActive,
    });
  };

  const handleRegenerate = () => {
    if (!canWrite) return;
    setInviteCode(randomCode());
    toast.info('Código regenerado. Recuerda guardar los cambios.');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const banner = license?.banner;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Mi negocio"
        title="Configuración del negocio"
        description="Administra el perfil, la identidad y el código de invitación de tu equipo."
        icon={Building2}
        actions={
          <div className="flex items-center gap-2">
            <PlanBadge plan={business.license_plan} />
            <StatusPill status={business.billing_status} />
          </div>
        }
      />

      {banner && (
        <div className={`mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3 ${BANNER_TONES[banner.tone] || BANNER_TONES.info}`}>
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">{banner.title}</p>
            <p className="text-sm opacity-90">{banner.message}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6">
        <SectionCard
          title="Perfil del negocio"
          description="Información general que ven tus clientes y tu equipo."
          icon={Building2}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre comercial</Label>
              <Input id="name" value={form.name} onChange={set('name')} disabled={!canWrite} placeholder="Ej. Café Aurora" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="legal_name">Razón social</Label>
              <Input id="legal_name" value={form.legal_name} onChange={set('legal_name')} disabled={!canWrite} placeholder="Ej. Aurora SA de CV" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rfc">RFC</Label>
              <Input id="rfc" value={form.rfc} onChange={set('rfc')} disabled={!canWrite} placeholder="XAXX010101000" className="tnum uppercase" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="industry">Industria</Label>
              <Select value={form.industry} onValueChange={set('industry')} disabled={!canWrite}>
                <SelectTrigger id="industry">
                  <SelectValue placeholder="Selecciona una industria" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((i) => (
                    <SelectItem key={i} value={i}>{i}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact_email">Correo de contacto</Label>
              <Input id="contact_email" type="email" value={form.contact_email} onChange={set('contact_email')} disabled={!canWrite} placeholder="contacto@negocio.mx" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" value={form.phone} onChange={set('phone')} disabled={!canWrite} placeholder="55 1234 5678" className="tnum" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="address">Dirección</Label>
              <Input id="address" value={form.address} onChange={set('address')} disabled={!canWrite} placeholder="Calle, número, colonia" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Ciudad</Label>
              <Input id="city" value={form.city} onChange={set('city')} disabled={!canWrite} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="state">Estado</Label>
              <Input id="state" value={form.state} onChange={set('state')} disabled={!canWrite} />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Identidad de marca"
          description="Logo y color que personalizan la experiencia de tus clientes."
          icon={Palette}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="logo_url">URL del logo</Label>
              <Input id="logo_url" value={form.logo_url} onChange={set('logo_url')} disabled={!canWrite} placeholder="https://…/logo.png" />
              {form.logo_url ? (
                <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <img src={form.logo_url} alt="Logo" className="h-10 w-10 rounded-lg object-contain bg-white" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  <span className="text-xs text-slate-500">Vista previa del logo</span>
                </div>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="primary_color">Color principal</Label>
              <div className="flex items-center gap-3">
                <input
                  id="primary_color"
                  type="color"
                  value={form.primary_color}
                  onChange={set('primary_color')}
                  disabled={!canWrite}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white disabled:cursor-not-allowed"
                />
                <Input value={form.primary_color} onChange={set('primary_color')} disabled={!canWrite} className="tnum uppercase max-w-[140px]" />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={!canWrite}
                    onClick={() => setForm((f) => ({ ...f, primary_color: c }))}
                    className="h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-white transition disabled:opacity-50"
                    style={{ backgroundColor: c, boxShadow: form.primary_color === c ? `0 0 0 2px ${c}` : 'none' }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Código de invitación del equipo"
          description="Comparte este código con tu equipo para que se unan a tu negocio al registrarse."
          icon={KeyRound}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <Label>Código actual</Label>
              <div className="flex items-center gap-2">
                <span className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 font-display text-2xl font-bold tracking-[0.25em] text-violet-700 tnum">
                  {inviteCode || '——————'}
                </span>
                <Button type="button" variant="outline" size="icon" onClick={handleCopy} disabled={!inviteCode} title="Copiar" aria-label="Copiar código de invitación">
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button type="button" variant="outline" onClick={handleRegenerate} disabled={!canWrite}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Regenerar
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <Switch checked={inviteActive} onCheckedChange={setInviteActive} disabled={!canWrite} id="invite_active" />
              <Label htmlFor="invite_active" className="cursor-pointer">
                {inviteActive ? 'Código activo' : 'Código inactivo'}
              </Label>
            </div>
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Al regenerar el código, el anterior dejará de funcionar. No olvides guardar los cambios.
          </p>
        </SectionCard>

        <Separator />

        <div className="flex items-center justify-end gap-3">
          {!canWrite && (
            <span className="text-sm text-amber-600">Edición deshabilitada por el estado de tu licencia.</span>
          )}
          <Button onClick={handleSave} disabled={!canWrite || saveMutation.isPending} className="bg-violet-600 hover:bg-violet-700">
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
