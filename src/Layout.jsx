import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { base44 } from '@/api/base44Client';
import { 
  Wallet, 
  Gift, 
  History, 
  MessageCircle, 
  User, 
  Store, 
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
    } catch (e) {
      // User not logged in
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  const isAdmin = user?.role === 'admin';
  const isMerchant = user?.merchant_role === 'merchant' || user?.role === 'admin';

  // Navigation items by role
  const customerNav = [
    { name: 'Inicio', page: 'Home', icon: Wallet },
    { name: 'Mi Wallet', page: 'Wallet', icon: Wallet },
    { name: 'Ofertas', page: 'Offers', icon: Gift },
    { name: 'Historial', page: 'History', icon: History },
    { name: 'Chat', page: 'Chat', icon: MessageCircle },
  ];

  const merchantNav = [
    { name: 'Punto de Venta', page: 'MerchantPOS', icon: Store },
  ];

  const adminNav = [
    { name: 'Dashboard', page: 'AdminDashboard', icon: LayoutDashboard },
    { name: 'Tiendas', page: 'AdminStores', icon: Store },
    { name: 'Campañas', page: 'AdminCampaigns', icon: Sparkles },
    { name: 'Clientes', page: 'AdminCustomers', icon: User },
    { name: 'Auditoría', page: 'AdminAudit', icon: History },
  ];

  // Determine which navigation to show
  let navigation = customerNav;
  if (currentPageName?.startsWith('Admin')) {
    navigation = adminNav;
  } else if (currentPageName?.startsWith('Merchant')) {
    navigation = merchantNav;
  }

  // Pages without layout
  const noLayoutPages = ['Login', 'Register'];
  if (noLayoutPages.includes(currentPageName)) {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-violet-200"></div>
          <div className="h-4 w-24 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/30">
      <style>{`
        :root {
          --color-primary: 139 92 246;
          --color-primary-dark: 124 58 237;
          --color-accent: 236 72 153;
        }
        .gradient-text {
          background: linear-gradient(135deg, rgb(var(--color-primary)) 0%, rgb(var(--color-accent)) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .glass-card {
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.5);
        }
      `}</style>

      {/* Top Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to={createPageUrl('Home')} className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold gradient-text hidden sm:block">LoyaltyAI</span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navigation.map((item) => (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                    currentPageName === item.page
                      ? "bg-violet-100 text-violet-700"
                      : "text-slate-600 hover:text-violet-700 hover:bg-violet-50"
                  )}
                >
                  {item.name}
                </Link>
              ))}
            </nav>

            {/* User Menu / Actions */}
            <div className="flex items-center gap-3">
              {user ? (
                <>
                  {/* Role Switcher */}
                  <div className="hidden md:flex items-center gap-2 mr-2">
                    {isAdmin && (
                      <Link to={createPageUrl('AdminDashboard')}>
                        <Button variant="ghost" size="sm" className="text-xs">
                          Admin
                        </Button>
                      </Link>
                    )}
                    {isMerchant && !currentPageName?.startsWith('Merchant') && (
                      <Link to={createPageUrl('MerchantPOS')}>
                        <Button variant="ghost" size="sm" className="text-xs">
                          POS
                        </Button>
                      </Link>
                    )}
                    {(currentPageName?.startsWith('Admin') || currentPageName?.startsWith('Merchant')) && (
                      <Link to={createPageUrl('Home')}>
                        <Button variant="ghost" size="sm" className="text-xs">
                          Mi Cuenta
                        </Button>
                      </Link>
                    )}
                  </div>

                  <Link to={createPageUrl('Profile')}>
                    <Button variant="ghost" size="icon" className="rounded-full">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-400 to-pink-400 flex items-center justify-center text-white text-sm font-medium">
                        {user.full_name?.[0] || user.email?.[0] || 'U'}
                      </div>
                    </Button>
                  </Link>

                  <Button variant="ghost" size="icon" onClick={handleLogout} className="hidden md:flex">
                    <LogOut className="h-4 w-4 text-slate-500" />
                  </Button>
                </>
              ) : (
                <Button 
                  onClick={() => base44.auth.redirectToLogin()}
                  className="bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white shadow-lg shadow-violet-500/25"
                >
                  Iniciar Sesión
                </Button>
              )}

              {/* Mobile Menu Button */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="md:hidden"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-slate-200/50 bg-white/95 backdrop-blur-xl">
            <nav className="px-4 py-3 space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.page}
                    to={createPageUrl(item.page)}
                    onClick={() => setIsMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                      currentPageName === item.page
                        ? "bg-violet-100 text-violet-700"
                        : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{item.name}</span>
                    <ChevronRight className="h-4 w-4 ml-auto opacity-50" />
                  </Link>
                );
              })}
              
              {user && (
                <>
                  <div className="border-t border-slate-100 my-2" />
                  {isAdmin && (
                    <Link
                      to={createPageUrl('AdminDashboard')}
                      onClick={() => setIsMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50"
                    >
                      <LayoutDashboard className="h-5 w-5" />
                      <span className="font-medium">Panel Admin</span>
                    </Link>
                  )}
                  {isMerchant && (
                    <Link
                      to={createPageUrl('MerchantPOS')}
                      onClick={() => setIsMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50"
                    >
                      <Store className="h-5 w-5" />
                      <span className="font-medium">Punto de Venta</span>
                    </Link>
                  )}
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 w-full"
                  >
                    <LogOut className="h-5 w-5" />
                    <span className="font-medium">Cerrar Sesión</span>
                  </button>
                </>
              )}
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="pt-16 min-h-screen">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-100 py-4 text-center">
        <p className="text-xs text-slate-400">
          © 2026 ACACIA Consultoría en Informática y Cómputo. Todos los Derechos Reservados.
        </p>
      </footer>

      {/* Bottom Navigation - Mobile Only (Customer) */}
      {user && !currentPageName?.startsWith('Admin') && !currentPageName?.startsWith('Merchant') && (
        <nav className="fixed bottom-0 left-0 right-0 md:hidden glass-card border-t border-slate-200/50 safe-area-bottom">
          <div className="flex items-center justify-around py-2">
            {customerNav.slice(0, 5).map((item) => {
              const Icon = item.icon;
              const isActive = currentPageName === item.page;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  className={cn(
                    "flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all",
                    isActive
                      ? "text-violet-600"
                      : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  <Icon className={cn("h-5 w-5", isActive && "scale-110")} />
                  <span className="text-[10px] font-medium">{item.name}</span>
                  {isActive && (
                    <div className="absolute bottom-1 h-1 w-1 rounded-full bg-violet-500" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}