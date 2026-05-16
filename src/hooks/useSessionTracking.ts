import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';

const REVOKE_CHECK_INTERVAL_MS = 15_000;

function getJwtSessionId(accessToken?: string | null): string | null {
  try {
    const payload = accessToken?.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized))?.session_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Fires auth-login-notify once per session — registers the device in
 * user_sessions, writes login_history, and triggers a "new sign-in" email
 * if this device hasn't been seen before.
 */
export function useSessionTracking() {
  const { user, authReady } = useAuth();
  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const kickIfRevoked = async (trackedSessionId: string) => {
      const { data } = await supabase
        .from('user_sessions')
        .select('revoked_at')
        .eq('id', trackedSessionId)
        .maybeSingle();

      if (!cancelled && data?.revoked_at) {
        await supabase.auth.signOut({ scope: 'local' as any });
        window.location.assign('/login');
      }
    };

    const trackAndWatch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const authSessionId = getJwtSessionId(session?.access_token);
      const sessionKey = authSessionId || 'legacy';
      const trackedKey = `vybe-session-tracked-${user.id}-${sessionKey}`;
      const idKey = `vybe-app-session-id-${user.id}-${sessionKey}`;
      let trackedSessionId: string | null = null;

      try {
        trackedSessionId = sessionStorage.getItem(idKey);
        if (!sessionStorage.getItem(trackedKey)) {
          const { data } = await supabase.functions.invoke('auth-login-notify', {
            body: { method: 'password', deviceFingerprint: authSessionId },
          });
          trackedSessionId = (data as any)?.sessionId || trackedSessionId;
          if (trackedSessionId) sessionStorage.setItem(idKey, trackedSessionId);
          sessionStorage.setItem(trackedKey, String(Date.now()));
        }
      } catch (e) {
        console.warn('session tracking failed', e);
      }

      if (!trackedSessionId && authSessionId) {
        const { data } = await supabase
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
