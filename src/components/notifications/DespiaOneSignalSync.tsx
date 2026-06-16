import { useEffect } from 'react';
import { db } from '@/lib/firebase';
import { useQueryClient } from '@tanstack/react-query';
import { relinkDespiaPushInBackground, checkDespiaPushPermission } from '@/lib/despiaOneSignal';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { navigationRef } from '@/lib/navigationRef';
import {
  buildNotificationRoute,
  normalizeNotificationPayload,
} from '@/lib/notificationActions';


const PUSH_PERM_KEY = 'vybe_push_permission_asked_v1';
type OneSignalApi = {
  login?: (id: string) => Promise<void>;
  logout?: () => Promise<void>;
  User?: {
    addTags?: (tags: Record<string, string>) => Promise<void>;
    addAlias?: (label: string, id: string) => Promise<void>;
  };
};
type OneSignalDeferredWindow = Window & { OneSignalDeferred?: Array<(api: OneSignalApi) => Promise<void>> };

// Reject obvious placeholder/invalid external IDs to avoid corrupting the
// OneSignal user graph (per OneSignal docs: external_id must be a stable
// authenticated identifier — never null/0/guest/empty).
function isValidExternalId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim().toLowerCase();
  if (!trimmed) return false;
  return !['null', 'undefined', '0', 'guest', 'anonymous', 'false'].includes(trimmed);
}

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
    const setPlayerIdForAuthUser = async (
      authUserId: string | undefined | null,
      email: string | undefined | null,
      trigger: string,
    ) => {
      if (!isValidExternalId(authUserId)) {
        console.warn(`[OneSignal:${trigger}] Skipping — invalid auth user id:`, authUserId);
        return;
      }
      try {
        // OneSignal external_id MUST match the id used by app push call sites,
        // which is profiles.id (NOT auth.users.id). auth.uid is kept as a
        // backup alias/tag for debugging + fallback lookup only.
        const { data: profile } = await db
          .from('profiles')
          .select('id')
          .eq('user_id', authUserId)
          .maybeSingle();
        const externalId = profile?.id ?? authUserId;

        if (!isValidExternalId(externalId)) {
          console.warn(`[OneSignal:${trigger}] Skipping — resolved external id invalid:`, externalId);
          return;
        }

        console.log(`[OneSignal:${trigger}] linking`, {
          primaryExternalId_profileId: externalId,
          backupAlias_authUid: authUserId,
          despiaNative: isDespiaRuntime(),
        });

        const permission = await checkDespiaPushPermission();
        const shouldAskPermission = permission !== true;
        relinkDespiaPushInBackground(
          externalId,
          trigger,
          shouldAskPermission || trigger === 'login',
        );
        if (trigger === 'login' || trigger === 'initial-session') {
          void import('@/lib/nativeIncomingCall').then((m) => m.ensureIncomingCallPermissions());
        }

        // Web OneSignal SDK bridge — required so web/PWA users receive
        // pushes targeted via include_aliases.external_id. Safe on hosts
        // where the SDK didn't load (preview/native/disabled-host).
        try {
          const w = window as OneSignalDeferredWindow;
          if (!Array.isArray(w.OneSignalDeferred)) {
            w.OneSignalDeferred = [];
          }
          w.OneSignalDeferred.push(async (OneSignal) => {
            try {
              await OneSignal?.login?.(externalId);
              console.info(`[OneSignal:${trigger}] web login() OK external_id=${externalId}`);

              // Backup alias: auth.uid → never used by backend push sends, but
              // lets us look users up in OneSignal dashboard by either ID and
              // recover bindings if profile.id ever rotates.
              try {
                await OneSignal?.User?.addAlias?.('supabase_auth_uid', authUserId);
                console.info(`[OneSignal:${trigger}] backup alias supabase_auth_uid=${authUserId} added`);
              } catch (aliasErr) {
                console.warn(`[OneSignal:${trigger}] addAlias() failed:`, aliasErr);
              }

              // Tags for segments + admin search.
              const tags: Record<string, string> = {
                user_id: externalId,           // profile.id (primary)
                auth_id: authUserId,           // backup
                profile_id: externalId,        // explicit duplicate for clarity
              };
              if (email) tags.email = email;
              try {
                await OneSignal?.User?.addTags?.(tags);
                console.info(`[OneSignal:${trigger}] addTags() OK`, Object.keys(tags));
              } catch (tagErr) {
                console.warn(`[OneSignal:${trigger}] addTags() failed:`, tagErr);
              }
            } catch (loginErr) {
              console.error(`[OneSignal:${trigger}] web login() failed:`, loginErr);
            }
          });
        } catch (err) {
          console.warn(`[OneSignal:${trigger}] deferred queue setup failed:`, err);
        }
      } catch (err) {
        console.warn(`[OneSignal:${trigger}] Failed to set player id:`, err);
      }
    };

    const clearPlayerId = () => {
      try {
        const w = window as OneSignalDeferredWindow;
        if (!Array.isArray(w.OneSignalDeferred)) {
          w.OneSignalDeferred = [];
        }
        w.OneSignalDeferred.push(async (OneSignal) => {
          try {
            await OneSignal?.logout?.();
            console.info('[OneSignal:signout] logout() OK');
          } catch (err) {
            console.warn('[OneSignal:signout] logout() failed:', err);
          }
        });
      } catch { /* ignore */ }
    };


    const requestPushPermissionOnce = () => {
      if (!isDespiaRuntime()) {
        console.log('[OneSignal:permission-grant] skipped — not Despia native');
        return;
      }
      try {
        const alreadyAsked = localStorage.getItem(PUSH_PERM_KEY);
        if (alreadyAsked) return;
        localStorage.setItem(PUSH_PERM_KEY, String(Date.now()));
        void db.auth.getUser().then(({ data }) => {
          if (!data.user?.id) return;
          void db
            .from('profiles')
            .select('id')
            .eq('user_id', data.user.id)
            .maybeSingle()
            .then(({ data: profile }) => {
              const externalId = profile?.id ?? data.user!.id;
              console.log('[OneSignal:permission-grant] prompting + linking', {
                primaryExternalId_profileId: externalId,
                backupAlias_authUid: data.user!.id,
              });
              relinkDespiaPushInBackground(externalId, 'permission-grant', true);
            });
        });
      } catch (err) {
        console.warn('[OneSignal:permission-grant] failed:', err);
      }
    };

    const relinkDespiaPush = () => {
      if (!isDespiaRuntime()) return;
      void db.auth.getUser().then(({ data }) => {
        if (!data.user?.id) return;
        void db
          .from('profiles')
          .select('id')
          .eq('user_id', data.user.id)
          .maybeSingle()
          .then(({ data: profile }) => {
            const externalId = profile?.id ?? data.user!.id;
            relinkDespiaPushInBackground(externalId, 'foreground-relink');
          });
      });
    };

    db.auth.getUser().then(({ data }) => {
      void setPlayerIdForAuthUser(data.user?.id, data.user?.email, 'cold-start');
    }).catch(() => {});

    // Login / signup / token refresh / user updates — all re-link.
    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user?.id) {
        console.log('[OneSignal:signout] clearing player id');
        clearPlayerId();
        return;
      }
      const triggerMap: Record<string, string> = {
        SIGNED_IN: 'login',
        TOKEN_REFRESHED: 'token-refresh',
        USER_UPDATED: 'user-updated',
        INITIAL_SESSION: 'initial-session',
      };
      const trigger = triggerMap[event] ?? event.toLowerCase();
      void setPlayerIdForAuthUser(session.user.id, session.user.email, trigger);
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
      if (document.visibilityState === 'visible') {
        refresh();
        relinkDespiaPush();
      }
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('despia:push', refresh as EventListener);


    // Despia notification tap handler — routes via React Router using
    // data.path (preferred) or data.url, and re-emits metadata for listeners.
    // See: https://setup.despia.com (OneSignal reference, onNotificationEvent).
    type DespiaNotificationPayload = {
      type?: string;
      path?: string;
      url?: string;
      action?: string;
      metadata?: unknown;
    };
    const w = window as Window & {
      onNotificationEvent?: (p: DespiaNotificationPayload) => void;
    };
    const previousHandler = w.onNotificationEvent;
    w.onNotificationEvent = (payload: DespiaNotificationPayload) => {
      try {
        const normalized = normalizeNotificationPayload(payload);
        if (normalized) {
          const route = buildNotificationRoute(normalized);
          if (navigationRef.current) navigationRef.current(route);
          else if (route) window.location.assign(route);
          window.dispatchEvent(new CustomEvent('vybe:notification-action', { detail: normalized }));
        } else {
          const target = payload?.path || payload?.url;
          if (target && navigationRef.current) {
            let route = target;
            try {
              if (/^https?:\/\//i.test(target)) {
                const u = new URL(target);
                route = `${u.pathname}${u.search}${u.hash}`;
              }
            } catch { /* ignore */ }
            navigationRef.current(route);
          }
          if (payload?.metadata !== undefined) {
            const meta = typeof payload.metadata === 'string'
              ? (() => { try { return JSON.parse(payload.metadata as string); } catch { return payload.metadata; } })()
              : payload.metadata;
            window.dispatchEvent(new CustomEvent('despia:notification:metadata', { detail: meta }));
          }
        }
        refresh();
      } catch (err) {
        console.warn('[Despia] onNotificationEvent handler failed:', err);
      }
    };

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('despia:push', refresh as EventListener);
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('touchstart', onFirstGesture);
      w.onNotificationEvent = previousHandler;
    };
  }, [queryClient]);

  return null;
}
