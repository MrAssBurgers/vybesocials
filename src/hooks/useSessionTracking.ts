import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import {
  getJwtSessionId,
  rememberCurrentSessionHash,
  rememberSelfLoginChallenge,
} from '@/lib/sessionIdentity';

const REVOKE_CHECK_INTERVAL_MS = 15_000;

/**
 * Fires auth-login-notify once per session — registers the device in
 * user_sessions, writes login_history, and alerts OTHER signed-in devices
 * when a new login hits the same account (never self on routine sign-in).
 */
export function useSessionTracking() {
  const { user, authReady } = useAuth();
  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const kickIfRevoked = async (trackedSessionId: string) => {
      const { data } = await db
        .from('user_sessions')
        .select('revoked_at')
        .eq('id', trackedSessionId)
        .maybeSingle();

      if (!cancelled && data?.revoked_at) {
        await db.auth.signOut({ scope: 'local' as any });
        window.location.assign('/login');
      }
    };

    const trackAndWatch = async () => {
      const { data: { session } } = await db.auth.getSession();
      const authSessionId = getJwtSessionId(session?.access_token);
      const sessionKey = authSessionId || 'legacy';
      const trackedKey = `vybe-session-tracked-${user.id}-${sessionKey}`;
      const idKey = `vybe-app-session-id-${user.id}-${sessionKey}`;
      let trackedSessionId: string | null = null;

      if (authSessionId) {
        rememberCurrentSessionHash(user.id, authSessionId);
      }

      try {
        trackedSessionId = sessionStorage.getItem(idKey);
        if (!sessionStorage.getItem(trackedKey)) {
          const { data } = await db.functions.invoke('auth-login-notify', {
            body: {
              method: 'password',
              deviceFingerprint: authSessionId,
              userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
            },
          });
          const payload = data as {
            sessionId?: string;
            challengeId?: string;
            notified?: boolean;
          } | null;
          trackedSessionId = payload?.sessionId || trackedSessionId;
          if (payload?.challengeId) {
            rememberSelfLoginChallenge(user.id, payload.challengeId);
          }
          if (trackedSessionId) sessionStorage.setItem(idKey, trackedSessionId);
          sessionStorage.setItem(trackedKey, String(Date.now()));
        }
      } catch (e) {
        console.warn('session tracking failed', e);
      }

      if (!trackedSessionId && authSessionId) {
        const { data } = await db
          .from('user_sessions')
          .select('id, revoked_at')
          .eq('user_id', user.id)
          .eq('session_token_hash', authSessionId)
          .maybeSingle();
        trackedSessionId = data?.id ?? null;
        if (trackedSessionId) sessionStorage.setItem(idKey, trackedSessionId);
        if (data?.revoked_at) await kickIfRevoked(trackedSessionId);
      }

      if (trackedSessionId && !cancelled) {
        await kickIfRevoked(trackedSessionId);
        interval = setInterval(() => kickIfRevoked(trackedSessionId), REVOKE_CHECK_INTERVAL_MS);
      }
    };

    trackAndWatch();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [authReady, user?.id]);
}
