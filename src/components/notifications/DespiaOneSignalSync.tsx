import { useEffect } from 'react';
import despia from 'despia-native';
import { supabase } from '@/integrations/supabase/client';

/**
 * Syncs the authenticated Supabase user ID with OneSignal's external user ID
 * via the Despia native bridge. Runs on every app load and on auth changes,
 * so push notifications can be targeted to the logged-in user.
 *
 * Safe on web: despia() is a no-op outside of the Despia native wrapper.
 */
export function DespiaOneSignalSync() {
  useEffect(() => {
    const setPlayerId = (userId: string | undefined | null) => {
      if (!userId) return;
      try {
        despia(`setonesignalplayerid://?user_id=${userId}`);
      } catch (err) {
        console.warn('[Despia] Failed to set OneSignal player id:', err);
      }
    };

    // On every app load
    supabase.auth.getUser().then(({ data }) => {
      setPlayerId(data.user?.id);
    });

    // Re-sync whenever auth state changes (sign-in, token refresh, user update)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setPlayerId(session?.user?.id);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
