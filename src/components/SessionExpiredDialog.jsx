import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { ShieldAlert } from 'lucide-react';

// Shown for both causes of a closed session: the local idle timer fired, or
// the server marked this session 'revoked' (the Module 20 stale-session
// reap job, or an admin's remote force-logout) — the user doesn't need to
// know which; either way the only two sane actions are re-auth or sign out.
//
// ONE LINE DIVERGES from the canonical copy in jospabloh/acacia-app-standard
// → shared/session/SessionExpiredDialog.jsx, and it is deliberate: the
// canonical file calls base44.auth.redirectToLogin(), which sends the browser
// to the platform-served lowercase `/login` that Base44 owns and answers with
// its own generic page. Module 10 of this app is precisely that this app must
// never bounce a user there (see the long comment in src/App.jsx), so here the
// button goes to `/Login`, the app's own branded screen. Everything else in
// this file is byte-identical; keep it that way.
export default function SessionExpiredDialog({ open }) {
  const handleLogin = () => { window.location.assign('/Login'); };
  const handleLogout = () => base44.auth.logout();

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-sm mx-auto" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-center mb-3">
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="w-7 h-7 text-destructive" />
            </div>
          </div>
          <DialogTitle className="text-center">Sesión expirada</DialogTitle>
          <DialogDescription className="text-center">
            Tu sesión ha expirado por inactividad. Vuelve a iniciar sesión para continuar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 mt-2">
          <Button onClick={handleLogin} className="w-full">
            Volver a iniciar sesión
          </Button>
          <Button variant="outline" onClick={handleLogout} className="w-full">
            Cerrar sesión completamente
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
