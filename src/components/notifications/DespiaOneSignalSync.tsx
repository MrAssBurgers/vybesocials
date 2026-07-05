import { useEffect } from 'react';
import { db } from '@/lib/firebase';
import { useQueryClient } from '@tanstack/react-query';
import { isOneSignalBypassHost } from '@/lib/lovablePreview';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import {
  installPushRegistrationLifecycle,
  registerPushDevice,
  unregisterPushDevice,
  healthCheckPushRegistration,
} from '@/lib/notifications/NotificationRegistrationService';
import { recordPushOpened, recordPushReceived } from '@/lib/notifications/pushDiagnostics';
import { ingestNotificationFromBridge } from '@/components/notifications/NotificationActionRouter';
import { normalizeNotificationPayload } from '@/lib/notificationActions';
import { presentNativeIncomingCall } from '@/lib/nativeIncomingCall';
import { fetchRingingCall } from '@/lib/notificationActions';

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

        if (isDespiaRuntime()) {
          const regReason =
            trigger === 'login' || trigger === 'initial-session'
              ? 'login'
              : trigger === 'token-refresh'
                ? 'token_refresh'
                : 'app_launch';
          void registerPushDevice(regReason as 'login' | 'token_refresh' | 'app_launch');
          if (trigger === 'login' || trigger === 'initial-session') {
            void import('@/lib/nativeIncomingCall').then((m) => m.ensureIncomingCallPermissions());
          }
          return;
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
      void unregisterPushDevice();
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


    const relinkOnResume = async () => {
      refresh();
      void registerPushDevice('foreground');
      void healthCheckPushRegistration();
    };

    const teardownLifecycle = installPushRegistrationLifecycle();

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
    });

    // Refresh in-app notifications whenever the app regains focus
    // (covers cold-launch from a push tap on Despia/Android).
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
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
    window.addEventListener('despia:push', (event: Event) => {
      recordPushReceived();
      const detail = (event as CustomEvent).detail;
      const payload = normalizeNotificationPayload(detail);
      if (payload) {
        window.dispatchEvent(new CustomEvent('vybe:push-received', { detail: payload }));
      }
    });

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
          if (normalized.type === 'call' || normalized.type === 'incoming_call') {
            void (async () => {
              if (normalized.callId) {
                const call = await fetchRingingCall(normalized.callId);
                if (call) {
                  window.dispatchEvent(new CustomEvent('vybe:incoming-call', { detail: call }));
                  void presentNativeIncomingCall(call);
                }
              }
            })();
          }
          ingestNotificationFromBridge(normalized);
        } else {
          const target = payload?.path || payload?.url;
          if (target) {
            ingestNotificationFromBridge({ path: target, type: payload?.type, action: payload?.action });
          }
          if (payload?.metadata !== undefined) {
            const meta = typeof payload.metadata === 'string'
              ? (() => { try { return JSON.parse(payload.metadata as string); } catch { return payload.metadata; } })()
              : payload.metadata;
            window.dispatchEvent(new CustomEvent('despia:notification:metadata', { detail: meta }));
          }
        }
        refresh();
        recordPushOpened();
      } catch (err) {
        console.warn('[Despia] onNotificationEvent handler failed:', err);
      }
    };

    return () => {
      teardownLifecycle();
      subscription.unsubscribe();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('app-resumed', relinkOnResume);
      window.removeEventListener('pageshow', relinkOnResume);
      window.removeEventListener('despia:push', refresh as EventListener);
      w.onNotificationEvent = previousHandler;
    };
  }, [queryClient]);

  return null;
}
