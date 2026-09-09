import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

/**
 * ACACIA portfolio session control — Module 20 of STANDARD.md.
 *
 * Three layers in one hook: idle detection (warn, then close the session), a
 * heartbeat that keeps this device's `AppSession` row alive, and a device
 * identity so Mission Control — and the user themselves, from Profile — can
 * tell "this device" from "another device the same account is logged in on."
 *
 * The thresholds below are the portfolio's and must not drift: an operator
 * running two ACACIA apps should meet the same warning at the same point in
 * both.
 *
 * ── Why this file is NOT byte-identical to the canonical one ──────────────
 * `jospabloh/acacia-app-standard` → `shared/session/useSessionManager.js`
 * talks to a `session` function router (`manageSession` / `sessionHeartbeat` /
 * `trackActivity`) over a `Session` entity carrying `device_id` and a
 * `status` of active|passive|revoked. Puntos+ predates that shape: it has
 * `AppSession` (deployed, live, read by Mission Control's `sessions.list` /
 * `sessions.revoke` bridge actions) whose revocation marker is the
 * `revoked_at` timestamp, not a `status` enum.
 *
 * Adopting the canonical contract verbatim would mean adding `device_id` /
 * `status` / `user_id` to a live entity — and an undeployed Base44 field is
 * SILENTLY DROPPED on write (see CLAUDE.md, "Base44 schema-as-code"), so a
 * `status: 'revoked'` written before the schema ships would simply vanish and
 * Layer 3 would look like it worked while reaping nothing. This adaptation
 * uses only fields that are already deployed, so all three layers work the
 * day this merges. The user-facing halves — `IdleWarningDialog` and
 * `SessionExpiredDialog` — ARE byte-identical to the canonical files, which
 * is the part the standard cares about being the same everywhere.
 *
 * This replaces `src/lib/SessionHeartbeat.jsx`, which owned the row and the
 * revocation check before. Same behaviour, with one deliberate change: a
 * revoked session now raises `SessionExpiredDialog` (re-auth, or sign out)
 * instead of bouncing the user straight to logout with no explanation.
 */

const IDLE_WARNING_MS = 20 * 60 * 1000;   // 20 min → show warning
const IDLE_LOGOUT_MS = 2 * 60 * 1000;     // 2 min after warning → close session
const HEARTBEAT_MS = 60 * 1000;           // move last_active_at at most this often
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'wheel'];
const SS_KEY = 'acacia_session_id';

// A short, human device label from the user agent: "Chrome · macOS".
export function deviceLabel() {
  const ua = navigator.userAgent || '';
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /OPR\//.test(ua) ? 'Opera' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const os =
    /iPhone|iPad|iPod/.test(ua) ? 'iOS' :
    /Android/.test(ua) ? 'Android' :
    /Mac OS X/.test(ua) ? 'macOS' :
    /Windows/.test(ua) ? 'Windows' :
    /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

/** The AppSession row id this tab owns, if it has one yet. */
export function currentSessionId() {
  try { return sessionStorage.getItem(SS_KEY); } catch { return null; }
}

export function useSessionManager() {
  const { isAuthenticated, user } = useAuth();
  const [idleState, setIdleState] = useState(null);       // null | 'idle_warning'
  const [sessionExpired, setSessionExpired] = useState(false);

  const idleTimerRef = useRef(null);
  const logoutTimerRef = useRef(null);
  const idRef = useRef(null);
  const lastBeatRef = useRef(0);
  const expiredRef = useRef(false);

  // ── Layer 1: idle detection ────────────────────────────────────────────
  const resetIdleTimers = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    clearTimeout(logoutTimerRef.current);
    setIdleState(null);

    idleTimerRef.current = setTimeout(() => {
      setIdleState('idle_warning');
      logoutTimerRef.current = setTimeout(() => {
        expiredRef.current = true;
        setSessionExpired(true);
        setIdleState(null);
      }, IDLE_LOGOUT_MS);
    }, IDLE_WARNING_MS);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const onActivity = () => {
      // Once the session is closed, activity must not silently revive it —
      // the dialog's own buttons are the only way back.
      if (expiredRef.current) return;
      resetIdleTimers();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    resetIdleTimers();

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      clearTimeout(idleTimerRef.current);
      clearTimeout(logoutTimerRef.current);
    };
  }, [isAuthenticated, resetIdleTimers]);

  // ── Layer 2: this device's row + the revocation check ──────────────────
  // Best-effort throughout: session tracking must never break the app.
  useEffect(() => {
    if (!isAuthenticated || !user) return undefined;
    let cancelled = false;

    // Layer 3 lands here: the reap job (and Mission Control's remote
    // force-logout) stamps `revoked_at`, and this is what turns that into a
    // forced re-auth the next time this tab wakes up.
    function enforce(rec, gone) {
      if (cancelled) return;
      if (gone || (rec && rec.revoked_at)) {
        try { sessionStorage.removeItem(SS_KEY); } catch { /* private mode */ }
        idRef.current = null;
        expiredRef.current = true;
        setSessionExpired(true);
      }
    }

    async function ensureSession() {
      if (idRef.current) return idRef.current;
      const stored = currentSessionId();
      if (stored) { idRef.current = stored; return stored; }
      const now = new Date().toISOString();
      try {
        const rec = await base44.entities.AppSession.create({
          user_email: user.email,
          user_name: user.full_name || user.email,
          device: deviceLabel(),
          started_at: now,
          last_active_at: now,
        });
        if (rec && rec.id) {
          try { sessionStorage.setItem(SS_KEY, rec.id); } catch { /* private mode */ }
          idRef.current = rec.id;
          lastBeatRef.current = Date.now();
          return rec.id;
        }
      } catch { /* tracking is best-effort */ }
      return null;
    }

    async function beat() {
      if (expiredRef.current) return;
      if (Date.now() - lastBeatRef.current < HEARTBEAT_MS) return;
      const id = await ensureSession();
      if (!id || cancelled) return;
      lastBeatRef.current = Date.now();
      try {
        const rec = await base44.entities.AppSession.update(id, { last_active_at: new Date().toISOString() });
        enforce(rec, false);
      } catch (e) {
        // A 404 means the row was removed (Mission Control, or a cleanup) →
        // treat exactly like a revocation.
        if (e && (e.status === 404 || e.response?.status === 404)) enforce(null, true);
      }
    }

    (async () => {
      const id = await ensureSession();
      if (!id || cancelled) return;
      try { enforce(await base44.entities.AppSession.get(id), false); }
      catch (e) { if (e && (e.status === 404 || e.response?.status === 404)) enforce(null, true); }
    })();

    const timer = setInterval(() => { if (document.visibilityState === 'visible') beat(); }, HEARTBEAT_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAuthenticated, user]);

  const continueSession = useCallback(() => {
    clearTimeout(logoutTimerRef.current);
    resetIdleTimers();
  }, [resetIdleTimers]);

  return { idleState, sessionExpired, continueSession };
}
