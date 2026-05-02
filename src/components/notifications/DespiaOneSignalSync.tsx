import { useEffect } from 'react';
import despia from 'despia-native';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

const isDespiaRuntime = () =>
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('despia');

/**
 * Syncs the authenticated Supabase user ID with OneSignal's external user ID
 * via the Despia native bridge, requests push permission on first run, and
 * refreshes notification queries whenever the app returns to the foreground
 * (so the in-app notification list stays current after a push arrives).
 *
 * Safe on web: despia() is a no-op outside the Despia native wrapper.
 */
export function DespiaOneSignalSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const setPlayerId = (userId: string | undefined | null) => {
      if (!userId) return;
      try {
        despia(`setonesignalplayerid://?user_id=${userId}`);
      } catch (err) {
        console.warn('[Despia] Failed to set OneSignal player id:', err);
      }
    };

    const ensurePushPermission = async () => {
      if (!isDespiaRuntime()) return;
      try {
        const result: any = await despia('checkNativePushPermissions://', [
          'nativePushEnabled',
        ]);
        if (result?.nativePushEnabled === false || result?.nativePushEnabled === 'false') {
          // Trigger the system prompt / settings deep link
          try { despia('settingsapp://'); } catch {}
        }
      } catch (err) {
        console.warn('[Despia] checkNativePushPermissions failed', err);
      }
    };

    supabase.auth.getUser().then(({ data }) => {
      setPlayerId(data.user?.id);
      if (data.user?.id) ensurePushPermission();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setPlayerId(session?.user?.id);
    });

    // Refresh in-app notifications whenever the app regains focus
    // (covers cold-launch from a push tap on Despia/Android).
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('despia:push', refresh as EventListener);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('despia:push', refresh as EventListener);
    };
  }, [queryClient]);

  return null;
}
