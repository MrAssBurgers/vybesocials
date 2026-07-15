import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import {
  rememberCurrentSessionHash,
  rememberSelfLoginChallenge,
} from '@/lib/sessionIdentity';
import { getOrCreateDeviceId } from '@/lib/notifications/pushDiagnostics';

const REVOKE_CHECK_INTERVAL_MS = 15_000;

/**
 * Registers this install in user_sessions and watches for remote revoke.
 * Uses a stable localStorage device id (Firebase JWTs have no session_id) so
 * cold starts do not look like new logins / spam "Was this you?" challenges.
 *
 * Real sign-in alerts are created only when `notifyFreshLogin` is called from
 * auth flows — not on every app open.
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
      const deviceFingerprint = getOrCreateDeviceId();
      rememberCurrentSessionHash(user.id, deviceFingerprint);

      const trackedKey = `vybe-session-tracked-${user.id}-${deviceFingerprint}`;
      const idKey = `vybe-app-session-id-${user.id}-${deviceFingerprint}`;
      let trackedSessionId: string | null = null;

      try {
        trackedSessionId = localStorage.getItem(idKey);
        let alreadyTracked = !!localStorage.getItem(trackedKey);
        // Let interactive login (notifyFreshLogin) claim a new auth first — avoids
        // racing session_resume vs password/oauth and dropping real location alerts.
        if (!alreadyTracked) {
          await new Promise((r) => window.setTimeout(r, 900));
          if (cancelled) return;
          alreadyTracked = !!localStorage.getItem(trackedKey);
          trackedSessionId = localStorage.getItem(idKey) || trackedSessionId;
        }
        if (!alreadyTracked) {
          const { data } = await db.functions.invoke('auth-login-notify', {
            body: {
              method: 'session_resume',
              deviceFingerprint,
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
          if (trackedSessionId) localStorage.setItem(idKey, trackedSessionId);
          localStorage.setItem(trackedKey, String(Date.now()));
        } else if (trackedSessionId) {
          // Known install — soft heartbeat for revoke checks only.
          void db.functions.invoke('auth-login-notify', {
            body: {
              method: 'session_resume',
              deviceFingerprint,
              userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
            },
          });
        }
      } catch (e) {
        console.warn('session tracking failed', e);
      }

      if (!trackedSessionId) {
        const { data } = await db
          .from('user_sessions')
          .select('id, revoked_at')
          .eq('user_id', user.id)
          .eq('session_token_hash', deviceFingerprint)
          .maybeSingle();
        trackedSessionId = data?.id ?? null;
        if (trackedSessionId) localStorage.setItem(idKey, trackedSessionId);
        if (data?.revoked_at && trackedSessionId) await kickIfRevoked(trackedSessionId);
      }

      if (trackedSessionId && !cancelled) {
        await kickIfRevoked(trackedSessionId);
        interval = setInterval(() => kickIfRevoked(trackedSessionId!), REVOKE_CHECK_INTERVAL_MS);
      }
    };

    trackAndWatch();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [authReady, user?.id]);
}

/** Call after a real password / OAuth / custom-token sign-in (not cold resume). */
export async function notifyFreshLogin(method: string): Promise<void> {
  try {
    const deviceFingerprint = getOrCreateDeviceId();
    const { data: { session } } = await db.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    rememberCurrentSessionHash(uid, deviceFingerprint);
    const trackedKey = `vybe-session-tracked-${uid}-${deviceFingerprint}`;
    const idKey = `vybe-app-session-id-${uid}-${deviceFingerprint}`;
    // Claim before invoke so cold-start resume does not win the race.
    localStorage.setItem(trackedKey, String(Date.now()));
    const { data } = await db.functions.invoke('auth-login-notify', {
      body: {
        method,
        deviceFingerprint,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      },
    });
    const payload = data as { challengeId?: string; sessionId?: string } | null;
    if (payload?.challengeId) rememberSelfLoginChallenge(uid, payload.challengeId);
    if (payload?.sessionId) localStorage.setItem(idKey, payload.sessionId);
  } catch (e) {
    console.warn('fresh login notify failed', e);
  }
}
