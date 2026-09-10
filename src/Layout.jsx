import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { base44 } from '@/api/base44Client';
import {
  Wallet, Gift, History as HistoryIcon, MessageCircle, User as UserIcon, Store,
  LayoutDashboard, LogOut, Menu, X, Sparkles, Building2, KeyRound, LifeBuoy,
  Users, Receipt, Settings, ShieldCheck, ScrollText, Megaphone, Crown, ChevronRight, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { getAppRole, ROLES } from '@/lib/rbac';
import { useStickyScroll } from '@/hooks/useStickyScroll';
import { getActiveBusinessName, isImpersonatingTenant, clearActiveBusiness } from '@/lib/activeTenant';
import BusinessSwitcher from '@/components/BusinessSwitcher';
import { goToLogin } from '@/lib/goToLogin';

const NO_LAYOUT_PAGES = ['Login', 'Register', 'Onboarding', 'ForgotPassword'];

// Back-office (sidebar) navigation per role
const OWNER_NAV = [
  { name: 'Resumen', page: 'PlatformDashboard', icon: LayoutDashboard },
  { name: 'Negocios', page: 'PlatformTenants', icon: Building2 },
  { name: 'Licencias', page: 'PlatformLicenses', icon: KeyRound },
  { name: 'Soporte', page: 'PlatformSupport', icon: LifeBuoy },
];

const ADMIN_NAV = [
  { name: 'Panel', page: 'AdminDashboard', icon: LayoutDashboard },
  { name: 'Tiendas', page: 'AdminStores', icon: Store },
  { name: 'Campañas', page: 'AdminCampaigns', icon: Megaphone },
  { name: 'Clientes', page: 'AdminCustomers', icon: Users },
  { name: 'Equipo', page: 'BusinessUsers', icon: ShieldCheck },
  { name: 'Facturación', page: 'BusinessBilling', icon: Receipt },
  { name: 'Configuración', page: 'BusinessSettings', icon: Settings },
  { name: 'Soporte', page: 'BusinessSupport', icon: LifeBuoy },
  { name: 'Auditoría', page: 'AdminAudit', icon: ScrollText },
];

const CUSTOMER_NAV = [
  { name: 'Inicio', page: 'Home', icon: Wallet },
  { name: 'Mi Wallet', page: 'Wallet', icon: Wallet },
  { name: 'Ofertas', page: 'Offers', icon: Gift },
  { name: 'Historial', page: 'History', icon: HistoryIcon },
  { name: 'Chat', page: 'Chat', icon: MessageCircle },
];

const OWNER_PAGES = OWNER_NAV.map((n) => n.page);
const ADMIN_PAGES = ADMIN_NAV.map((n) => n.page);
const isBackOfficePage = (p) => OWNER_PAGES.includes(p) || ADMIN_PAGES.includes(p);

function Wordmark({ subtitle }) {
  return (
    <Link to={createPageUrl('Home')} className="flex items-center gap-2.5">
      <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
        <Sparkles className="h-5 w-5 text-white" />
        <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-amber-400 ring-2 ring-white" />
      </div>
      <div className="leading-none">
        <span className="font-display text-lg font-bold text-slate-900 dark:text-slate-50">Puntos<span className="text-amber-500">+</span></span>
        {subtitle && <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-violet-400">{subtitle}</div>}
      </div>
    </Link>
  );
}

function RoleChip({ role }) {
  const map = {
    owner: { label: 'Plataforma', cls: 'bg-amber-50 text-amber-700 ring-amber-600/20', icon: Crown },
    business_admin: { label: 'Negocio', cls: 'bg-violet-50 text-violet-700 ring-violet-600/20', icon: Building2 },
    staff: { label: 'Equipo', cls: 'bg-sky-50 text-sky-700 ring-sky-600/20', icon: Store },
    customer: { label: 'Cliente', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-500/20', icon: UserIcon },
  };
  const r = map[role] || map.customer;
  const Icon = r.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', r.cls)}>
      <Icon className="h-3 w-3" /> {r.label}
    </span>
  );
}

/* ── Back-office sidebar navigation (module scope = stable identity) ──────
   `groups` is an array of { label?, items[] }. The platform owner gets two
   groups (Plataforma + Administración) so they can run the whole platform AND
   their own tenant from one sidebar; a business admin gets a single group. */
function NavLink({ item, currentPageName, onNavigate }) {
  const Icon = item.icon;
  const active = currentPageName === item.page;
  return (
    <Link
      to={createPageUrl(item.page)}
      onClick={onNavigate}
      className={cn(
        'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
        active ? 'bg-white dark:bg-slate-900 text-violet-700 shadow-sm ring-1 ring-violet-100' : 'text-slate-500 dark:text-slate-400 hover:bg-white/60 hover:text-slate-800 hover:dark:text-slate-100',
      )}
    >
      <Icon className={cn('h-[18px] w-[18px]', active ? 'text-violet-600' : 'text-slate-400 dark:text-slate-500 group-hover:text-violet-500')} />
      <span>{item.name}</span>
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-400" />}
    </Link>
  );
}

function BackOfficeNav({ groups, role, currentPageName, onNavigate }) {
  return (
    <nav className="space-y-1">
      {groups.map((group, gi) => (
        <div key={group.label || gi} className={gi > 0 ? 'pt-3' : ''}>
          {group.label && (
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{group.label}</div>
          )}
          <div className="space-y-1">
            {group.items.map((item) => (
              <NavLink key={item.page} item={item} currentPageName={currentPageName} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}
      <div className="my-3 border-t border-slate-200/70" />
      <NavLink item={{ name: 'Punto de venta', page: 'MerchantPOS', icon: Store }} currentPageName={currentPageName} onNavigate={onNavigate} />
      <NavLink item={{ name: 'Permisos', page: 'Permissions', icon: ShieldCheck }} currentPageName={currentPageName} onNavigate={onNavigate} />
      <NavLink item={{ name: 'Mi cuenta', page: 'Home', icon: Wallet }} currentPageName={currentPageName} onNavigate={onNavigate} />
      {/* Módulo 21: manual, novedades, versión y contacto — al alcance, no enterrado. */}
      <NavLink item={{ name: 'Acerca de', page: 'About', icon: Info }} currentPageName={currentPageName} onNavigate={onNavigate} />
    </nav>
  );
}

/* ── Back-office sidebar shell (owner + business admin) ─────────────────── */
function BackOfficeShell({ user, role, currentPageName, children }) {
  const [open, setOpen] = useState(false);
  // Módulo 23: el elemento activo ya sale de la ruta en cada render, pero la
  // posición del scroll dentro del menú no se deriva de nada — se recuerda.
  const navScrollRef = useStickyScroll('pp-sidebar-scroll');
  // The owner runs the whole platform AND can administer any tenant, so they get
  // both nav groups; a business admin gets only their tenant's administration.
  const groups = role === ROLES.OWNER
    ? [{ label: 'Plataforma', items: OWNER_NAV }, { label: 'Administración', items: ADMIN_NAV }]
    : [{ items: ADMIN_NAV }];
  const subtitle = role === ROLES.OWNER ? 'Consola' : 'Administración';

  return (
    <div className="min-h-screen pp-shell-bg">
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between border-b border-slate-200/60 bg-white/80 px-4 py-3 backdrop-blur-xl">
        <Wordmark subtitle={subtitle} />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} aria-label={open ? 'Cerrar menú' : 'Abrir menú'}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1400px]">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex sticky top-0 h-screen w-64 shrink-0 flex-col border-r border-slate-200/60 bg-violet-50/40 px-4 py-5">
          <div className="px-2"><Wordmark subtitle={subtitle} /></div>
          <div ref={navScrollRef} className="mt-6 flex-1 overflow-y-auto"><BackOfficeNav groups={groups} role={role} currentPageName={currentPageName} /></div>
          <div className="mt-4 rounded-2xl bg-white/70 p-3 ring-1 ring-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-sm font-semibold text-white">
                {user?.full_name?.[0] || user?.email?.[0] || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{user?.full_name || user?.email}</div>
                <RoleChip role={role} />
              </div>
            </div>
            {role === ROLES.BUSINESS_ADMIN && (
              <div className="mt-2 space-y-1">
                <BusinessSwitcher user={user} />
                <Link to={`${createPageUrl('Onboarding')}?join=1`} className="block text-xs font-medium text-violet-600 hover:underline">
                  Crear o unirme a otro negocio
                </Link>
              </div>
            )}
            <button onClick={() => base44.auth.logout()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-rose-50 hover:text-rose-600">
              <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
            </button>
          </div>
        </aside>

        {/* Mobile drawer */}
        {open && (
          <div className="md:hidden fixed inset-0 z-40" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
            <aside className="absolute left-0 top-0 h-full w-72 bg-white dark:bg-slate-900 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="px-2 pb-4"><Wordmark subtitle={subtitle} /></div>
              <BackOfficeNav groups={groups} role={role} currentPageName={currentPageName} onNavigate={() => setOpen(false)} />
              {role === ROLES.BUSINESS_ADMIN && (
                <div className="mt-3 space-y-1 px-1">
                  <BusinessSwitcher user={user} />
                  <Link to={`${createPageUrl('Onboarding')}?join=1`} onClick={() => setOpen(false)} className="block text-xs font-medium text-violet-600 hover:underline">
                    Crear o unirme a otro negocio
                  </Link>
                </div>
              )}
              <button onClick={() => base44.auth.logout()} className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50">
                <LogOut className="h-[18px] w-[18px]" /> Cerrar sesión
              </button>
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1">
          {role === ROLES.OWNER && ADMIN_PAGES.includes(currentPageName) && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/70 bg-amber-50/80 px-4 py-2 text-sm sm:px-6">
              <span className="flex items-center gap-2 text-amber-800">
                <Building2 className="h-4 w-4" /> Administrando: <strong className="font-semibold">{getActiveBusinessName(user) || 'tu negocio'}</strong>
              </span>
              <span className="flex items-center gap-3">
                <Link to={createPageUrl('PlatformTenants')} className="font-medium text-violet-700 hover:underline">Cambiar negocio</Link>
                {isImpersonatingTenant(user) && (
                  <button onClick={() => { clearActiveBusiness(); window.location.reload(); }} className="font-medium text-slate-500 dark:text-slate-400 hover:underline">Volver al mío</button>
                )}
              </span>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

/* ── Consumer shell (customer + staff) ─────────────────────────────────── */
function ConsumerShell({ user, role, currentPageName, children }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigation = CUSTOMER_NAV;
  const canPOS = role === ROLES.STAFF || role === ROLES.BUSINESS_ADMIN || role === ROLES.OWNER;
  const canAdmin = role === ROLES.BUSINESS_ADMIN || role === ROLES.OWNER;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-violet-950/20">
      <header className="fixed top-0 left-0 right-0 z-50 pp-glass border-b border-slate-200/50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <nav className="hidden items-center gap-1 md:flex">
            {navigation.map((item) => (
              <Link key={item.page} to={createPageUrl(item.page)}
                className={cn('rounded-lg px-4 py-2 text-sm font-medium transition-all',
                  currentPageName === item.page ? 'bg-violet-100 text-violet-700' : 'text-slate-600 dark:text-slate-300 hover:bg-violet-50 hover:text-violet-700')}>
                {item.name}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {canAdmin && (
              <Link to={createPageUrl(role === ROLES.OWNER ? 'PlatformDashboard' : 'AdminDashboard')} className="hidden md:block">
                <Button variant="ghost" size="sm" className="text-xs">{role === ROLES.OWNER ? 'Consola' : 'Administrar'}</Button>
              </Link>
            )}
            {canPOS && (
              <Link to={createPageUrl('MerchantPOS')} className="hidden md:block">
                <Button variant="ghost" size="sm" className="text-xs">POS</Button>
              </Link>
            )}
            {(role === ROLES.STAFF || role === ROLES.BUSINESS_ADMIN) && (
              <Link to={`${createPageUrl('Onboarding')}?join=1`} className="hidden md:block">
                <Button variant="ghost" size="sm" className="text-xs">Unirme a otro negocio</Button>
              </Link>
            )}
            {user ? (
              <Link to={createPageUrl('Profile')}>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-pink-400 text-sm font-medium text-white">
                    {user.full_name?.[0] || user.email?.[0] || 'U'}
                  </div>
                </Button>
              </Link>
            ) : (
              <Button onClick={goToLogin} className="bg-gradient-to-r from-violet-600 to-pink-600 text-white shadow-lg shadow-violet-500/25">
                Iniciar sesión
              </Button>
            )}
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)} aria-label={isMenuOpen ? 'Cerrar menú' : 'Abrir menú'}>
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        {isMenuOpen && (
          <div className="border-t border-slate-200/50 bg-white/95 backdrop-blur-xl md:hidden">
            <nav className="space-y-1 px-4 py-3">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.page} to={createPageUrl(item.page)} onClick={() => setIsMenuOpen(false)}
                    className={cn('flex items-center gap-3 rounded-xl px-4 py-3 transition-all',
                      currentPageName === item.page ? 'bg-violet-100 text-violet-700' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 hover:dark:bg-slate-900')}>
                    <Icon className="h-5 w-5" /><span className="font-medium">{item.name}</span><ChevronRight className="ml-auto h-4 w-4 opacity-40" />
                  </Link>
                );
              })}
              {(canPOS || canAdmin) && <div className="my-2 border-t border-slate-100 dark:border-slate-800" />}
              {canAdmin && (
                <Link to={createPageUrl(role === ROLES.OWNER ? 'PlatformDashboard' : 'AdminDashboard')} onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 hover:dark:bg-slate-900">
                  <LayoutDashboard className="h-5 w-5" /><span className="font-medium">{role === ROLES.OWNER ? 'Consola plataforma' : 'Administrar negocio'}</span>
                </Link>
              )}
              {canPOS && (
                <Link to={createPageUrl('MerchantPOS')} onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 hover:dark:bg-slate-900">
                  <Store className="h-5 w-5" /><span className="font-medium">Punto de venta</span>
                </Link>
              )}
              {(role === ROLES.STAFF || role === ROLES.BUSINESS_ADMIN) && (
                <Link to={`${createPageUrl('Onboarding')}?join=1`} onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 hover:dark:bg-slate-900">
                  <Building2 className="h-5 w-5" /><span className="font-medium">Unirme a otro negocio</span>
                </Link>
              )}
              {user && (
                <button onClick={() => base44.auth.logout()} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-rose-600 hover:bg-rose-50">
                  <LogOut className="h-5 w-5" /><span className="font-medium">Cerrar sesión</span>
                </button>
              )}
            </nav>
          </div>
        )}
      </header>

      <main className="min-h-screen pt-16">{children}</main>

      <footer className="border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 py-4 text-center">
        <p className="text-xs text-slate-400 dark:text-slate-500">© 2026 ACACIA Consultoría en Informática y Cómputo · Puntos+ · Todos los derechos reservados.</p>
      </footer>

      {user && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 pp-glass border-t border-slate-200/50 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex items-center justify-around py-2">
            {CUSTOMER_NAV.slice(0, 5).map((item) => {
              const Icon = item.icon;
              const isActive = currentPageName === item.page;
              return (
                <Link key={item.page} to={createPageUrl(item.page)} className={cn('flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 transition-all', isActive ? 'text-violet-600' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 hover:dark:text-slate-300')}>
                  <Icon className={cn('h-5 w-5', isActive && 'scale-110')} />
                  <span className="text-[10px] font-medium">{item.name}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  const { user, isLoading } = useCurrentUser();

  if (NO_LAYOUT_PAGES.includes(currentPageName)) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center pp-shell-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 animate-ping rounded-full bg-violet-300/40" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 shadow-lg shadow-violet-500/30">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="h-2 w-24 animate-pulse rounded-full bg-violet-200" />
        </div>
      </div>
    );
  }

  const role = getAppRole(user);
  const useBackOffice = isBackOfficePage(currentPageName) && (role === ROLES.OWNER || role === ROLES.BUSINESS_ADMIN);

  if (useBackOffice) {
    return <BackOfficeShell user={user} role={role} currentPageName={currentPageName}>{children}</BackOfficeShell>;
  }
  return <ConsumerShell user={user} role={role} currentPageName={currentPageName}>{children}</ConsumerShell>;
}