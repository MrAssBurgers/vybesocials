import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fires auth-login-notify once per session — registers the device in
 * user_sessions, writes login_history, and triggers a "new sign-in" email
 * if this device hasn't been seen before.
 */
export function useSessionTracking() {
  const { user, authReady } = useAuth();
  useEffect(() => {
    if (!authReady || !user) return;
    const key = `vybe-session-tracked-${user.id}`;
    try {
      const last = sessionStorage.getItem(key);
      if (last) return;
      sessionStorage.setItem(key, String(Date.now()));
    } catch {}
    supabase.functions.invoke('auth-login-notify', { body: { method: 'password' } })
      .catch((e) => console.warn('session tracking failed', e));
  }, [authReady, user?.id]);
}
