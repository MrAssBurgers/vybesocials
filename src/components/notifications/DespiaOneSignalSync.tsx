import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { ensureDespiaOneSignalLinked } from '@/lib/despiaOneSignal';
import { isDespiaRuntime } from '@/lib/despiaBridge';

const PUSH_PERM_KEY = 'vybe_push_permission_asked_v1';

/**
 * Syncs the authenticated Supabase user ID with OneSignal's external user ID
 * via the Despia native bridge, requests push permission on first eligible
 * user gesture (signed-in DM/call surface), and refreshes notification queries
 * whenever the app returns to the foreground.
 *
 * Safe on web: despia() is a no-op outside the Despia native wrapper.
 */
export function DespiaOneSignalSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const setPlayerIdForAuthUser = async (authUserId: string | undefined | null) => {
      if (!authUserId) return;
      try {
        // OneSignal external_id must match the id used by app push call sites,
        // which is profiles.id (NOT auth.users.id). Resolve and bind.
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', authUserId)
          .maybeSingle();
        const externalId = profile?.id ?? authUserId;

        // Despia native shell bridge (no-op on web). Keep this bounded so
        // startup/auth never hangs while OneSignal creates the subscription.
        void ensureDespiaOneSignalLinked(externalId, { waitForPlayerIdMs: 0 });

        // Web OneSignal SDK bridge — required so web/PWA users receive
        // pushes targeted via include_aliases.external_id. Safe on hosts
        // where the SDK didn't load (preview/native/disabled-host).
        try {
          const w = window as any;
          if (Array.isArray(w.OneSignalDeferred)) {
            w.OneSignalDeferred.push(async (OneSignal: any) => {
              try { await OneSignal?.login?.(externalId); } catch { /* ignore */ }
            });
          }
        } catch { /* ignore */ }
      } catch (err) {
        console.warn('[Despia] Failed to set OneSignal player id:', err);
      }
    };

    const clearPlayerId = () => {
      try {
        const w = window as any;
        if (Array.isArray(w.OneSignalDeferred)) {
          w.OneSignalDeferred.push(async (OneSignal: any) => {
            try { await OneSignal?.logout?.(); } catch { /* ignore */ }
          });
        }
      } catch { /* ignore */ }
    };

    const requestPushPermissionOnce = () => {
      if (!isDespiaRuntime()) return;
      try {
        if (localStorage.getItem(PUSH_PERM_KEY)) return;
        localStorage.setItem(PUSH_PERM_KEY, String(Date.now()));
        void supabase.auth.getUser().then(({ data }) => {
          if (!data.user?.id) return;
          void supabase
            .from('profiles')
            .select('id')
            .eq('user_id', data.user.id)
            .maybeSingle()
            .then(({ data: profile }) => {
              const externalId = profile?.id ?? data.user!.id;
              void ensureDespiaOneSignalLinked(externalId, {
                requestPermission: true,
                waitForPlayerIdMs: 0,
              });
            });
        });
      } catch (err) {
        console.warn('[Despia] checknativepushpermissions failed:', err);
      }
    };

    supabase.auth.getUser().then(({ data }) => {
      void setPlayerIdForAuthUser(data.user?.id);
    }).catch(() => {});

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user?.id) {
        clearPlayerId();
        return;
      }
      void setPlayerIdForAuthUser(session.user.id);
    });

    // Request push permission on the FIRST authenticated user gesture
    // (touch/click). This is what was missing — Despia auto-registers the
    // device but never prompts unless we explicitly ask, so brand-new installs
    // had no push subscription and never received DM/call notifications.
    const onFirstGesture = () => {
      requestPushPermissionOnce();
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('touchstart', onFirstGesture);
    };
    window.addEventListener('pointerdown', onFirstGesture, { once: true, passive: true });
    window.addEventListener('touchstart', onFirstGesture, { once: true, passive: true });

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
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('touchstart', onFirstGesture);
    };
  }, [queryClient]);

  return null;
}
