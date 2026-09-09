import IdleWarningDialog from '@/components/IdleWarningDialog';
import SessionExpiredDialog from '@/components/SessionExpiredDialog';
import { useSessionManager } from '@/hooks/useSessionManager';

/**
 * Module 20's mount point: runs the session manager once, app-wide, and
 * renders the two dialogs it drives. Replaces `src/lib/SessionHeartbeat.jsx`,
 * which kept the AppSession row but had no idle timer and closed a revoked
 * session by silently bouncing to logout.
 *
 * Must sit inside AuthProvider — the hook reads `useAuth()`.
 */
export default function SessionGuard() {
  const { idleState, sessionExpired, continueSession } = useSessionManager();

  return (
    <>
      <IdleWarningDialog open={idleState === 'idle_warning'} onContinue={continueSession} />
      <SessionExpiredDialog open={sessionExpired} />
    </>
  );
}
