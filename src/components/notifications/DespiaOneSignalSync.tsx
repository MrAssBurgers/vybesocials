import { useEffect } from 'react';
import { db } from '@/lib/firebase';
import { useQueryClient } from '@tanstack/react-query';
import { isOneSignalBypassHost } from '@/lib/lovablePreview';
import { relinkDespiaPushInBackground, checkDespiaPushPermission } from '@/lib/despiaOneSignal';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { navigationRef } from '@/lib/navigationRef';
import {
  buildNotificationRoute,
  normalizeNotificationPayload,
} from '@/lib/notificationActions';


const PUSH_PERM_KEY = 'vybe_push_permission_asked_v1';
let webOneSignalLinkedFor: string | null = null;
let webOneSignalLinkInFlight: Promise<void> | null = null;
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

async function resolveProfileExternalId(authUserId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: profile } = await db
      .from('profiles')
      .select('id')
      .eq('user_id', authUserId)
      .maybeSingle();
    if (profile?.id && isValidExternalId(profile.id)) return profile.id;
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return null;
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
        const externalId = await resolveProfileExternalId(authUserId);
        if (!externalId) {
          console.warn(`[OneSignal:${trigger}] profile not ready — will retry on foreground`);
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

        // Web OneSignal SDK — one login+tags pass per external id (avoids 409 conflicts).
        if (isOneSignalBypassHost()) {
          console.info(`[OneSignal:${trigger}] skipped on staging/preview host`);
        } else {
          try {
          const w = window as OneSignalDeferredWindow;
          if (!Array.isArray(w.OneSignalDeferred)) {
            w.OneSignalDeferred = [];
          }
          if (webOneSignalLinkedFor === externalId && webOneSignalLinkInFlight) {
            await webOneSignalLinkInFlight;
            return;
          }
          if (webOneSignalLinkedFor === externalId) return;

          webOneSignalLinkInFlight = new Promise<void>((resolve) => {
            w.OneSignalDeferred!.push(async (OneSignal) => {
              try {
                if (webOneSignalLinkedFor === externalId) {
                  resolve();
                  return;
                }
                await OneSignal?.login?.(externalId);
                console.info(`[OneSignal:${trigger}] web login() OK external_id=${externalId}`);

                try {
                  await OneSignal?.User?.addAlias?.('supabase_auth_uid', authUserId);
                } catch {
                  /* alias may already exist */
                }

                const tags: Record<string, string> = {
                  user_id: externalId,
                  auth_id: authUserId,
                };
                if (email) tags.email = email;
                try {
                  await OneSignal?.User?.addTags?.(tags);
                  console.info(`[OneSignal:${trigger}] addTags() OK`, Object.keys(tags));
                } catch {
                  /* tags may already match — ignore 409 */
                }
                webOneSignalLinkedFor = externalId;
              } catch (loginErr) {
                console.warn(`[OneSignal:${trigger}] web login() failed:`, loginErr);
              } finally {
                resolve();
              }
            });
          });
          await webOneSignalLinkInFlight;
          webOneSignalLinkInFlight = null;
        } catch (err) {
          console.warn(`[OneSignal:${trigger}] deferred queue setup failed:`, err);
        }
        }
      } catch (err) {
        console.warn(`[OneSignal:${trigger}] Failed to set player id:`, err);
      }
    };

    const clearPlayerId = () => {
      webOneSignalLinkedFor = null;
      webOneSignalLinkInFlight = null;
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
        void db.auth.getUser().then(async ({ data }) => {
          if (!data.user?.id) return;
          const externalId = await resolveProfileExternalId(data.user.id);
          if (!externalId) return;
          console.log('[OneSignal:permission-grant] prompting + linking', {
            primaryExternalId_profileId: externalId,
            backupAlias_authUid: data.user.id,
          });
          relinkDespiaPushInBackground(externalId, 'permission-grant', true);
        });
      } catch (err) {
        console.warn('[OneSignal:permission-grant] failed:', err);
      }
    };

    const relinkDespiaPush = (requestPermission = false) => {
      if (!isDespiaRuntime()) return;
      void db.auth.getUser().then(async ({ data }) => {
        if (!data.user?.id) return;
        const externalId = await resolveProfileExternalId(data.user.id);
        if (!externalId) return;
        relinkDespiaPushInBackground(externalId, 'foreground-relink', requestPermission);
      });
    };

    const relinkOnResume = async () => {
      refresh();
      if (!isDespiaRuntime()) return;
      const { data } = await db.auth.getUser();
      if (!data.user?.id) return;
      const externalId = await resolveProfileExternalId(data.user.id);
      if (!externalId) return;
      const permitted = await checkDespiaPushPermission();
      if (permitted) {
        await relinkDespiaPushInBackground(externalId, 'app-resume', false);
      } else {
        try {
          localStorage.removeItem(PUSH_PERM_KEY);
        } catch {
          /* ignore */
        }
        relinkDespiaPush(true);
      }
    };

    // INITIAL_SESSION / SIGNED_IN handle linking — skip redundant cold-start pass.
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
      if (event === 'TOKEN_REFRESHED') {
        void setPlayerIdForAuthUser(session.user.id, session.user.email, 'token-refresh');
        return;
      }
      void setPlayerIdForAuthUser(session.user.id, session.user.email, trigger);
      if (
        isDespiaRuntime() &&
        (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')
      ) {
        void db.auth.getUser().then(async ({ data }) => {
          if (!data.user?.id) return;
          const externalId = await resolveProfileExternalId(data.user.id);
          if (!externalId) return;
          relinkDespiaPushInBackground(externalId, 'login-auto-permission', true);
        });
      }
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
        void relinkOnResume();
      }
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('app-resumed', relinkOnResume);
    window.addEventListener('pageshow', relinkOnResume);
    window.addEventListener('despia:push', refresh as EventListener);

    // Re-link push subscription periodically while app is open (keeps background delivery fresh).
    const relinkInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') relinkDespiaPush();
    }, 5 * 60 * 1000);

    // Despia notification tap handler
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
      window.removeEventListener('app-resumed', relinkOnResume);
      window.removeEventListener('pageshow', relinkOnResume);
      window.removeEventListener('despia:push', refresh as EventListener);
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('touchstart', onFirstGesture);
      window.clearInterval(relinkInterval);
      w.onNotificationEvent = previousHandler;
    };
  }, [queryClient]);

  return null;
}
