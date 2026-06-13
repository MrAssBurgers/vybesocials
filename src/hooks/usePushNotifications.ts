import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { isPreviewServiceWorkerDisabled, registerVybeServiceWorker } from '@/lib/serviceWorker';
import { ensureDespiaOneSignalLinked, linkOneSignalUser, persistDespiaPushToken } from '@/lib/despiaOneSignal';
import { isDespiaRuntime } from '@/lib/despiaBridge';

// VAPID public key — fetched from the server (`get-vapid-key` edge function)
// so the browser subscribes with the SAME key the server signs pushes with.
// Cached in sessionStorage to avoid an extra round-trip on every subscribe.
let cachedVapidPublicKey: string | null = null;
async function fetchVapidPublicKey(): Promise<string> {
  if (cachedVapidPublicKey) return cachedVapidPublicKey;
  try {
    const stored = sessionStorage.getItem('vapid_public_key');
    if (stored) {
      cachedVapidPublicKey = stored;
      return stored;
    }
  } catch { /* sessionStorage unavailable */ }

  const { data, error } = await supabase.functions.invoke('get-vapid-key');
  if (error || !data?.publicKey) {
    throw new Error('Could not load push notification configuration. Please try again.');
  }
  cachedVapidPublicKey = data.publicKey;
  try { sessionStorage.setItem('vapid_public_key', data.publicKey); } catch { /* */ }
  return data.publicKey;
}

// Convert base64 to Uint8Array for VAPID key
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

type OneSignalDeferredWindow = Window & {
  OneSignalDeferred?: Array<(api: Record<string, unknown>) => Promise<void>>;
};

async function subscribeViaOneSignalWeb(profileId: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const w = window as OneSignalDeferredWindow;
  if (!Array.isArray(w.OneSignalDeferred)) return false;

  return new Promise((resolve) => {
    w.OneSignalDeferred!.push(async (OneSignal) => {
      try {
        const login = OneSignal.login as ((id: string) => Promise<void>) | undefined;
        const requestPermission = (OneSignal.Notifications as { requestPermission?: () => Promise<void> } | undefined)?.requestPermission;
        await login?.(profileId);
        await requestPermission?.();
        const pushSubscription = (OneSignal.User as { PushSubscription?: { id?: string; optedIn?: boolean } } | undefined)?.PushSubscription;
        const subscriptionId = typeof pushSubscription?.id === 'string' ? pushSubscription.id : '';
        const optedIn = pushSubscription?.optedIn === true || !!subscriptionId;
        if (optedIn) {
          const { error } = await supabase.from('push_tokens').upsert({
            user_id: profileId,
            platform: 'web',
            token: subscriptionId || `onesignal:${profileId}`,
          }, { onConflict: 'user_id,platform' });
          if (error) throw error;
          await linkOneSignalUser(profileId, subscriptionId || undefined);
        }
        resolve(optedIn);
      } catch (error) {
        console.warn('[Push] OneSignal web subscribe failed', error);
        resolve(false);
      }
    });
  });
}

const PUSH_INTENT_KEY = 'vybe.push.intent';

function readIntent(userId?: string): boolean {
  if (!userId) return false;
  try { return localStorage.getItem(`${PUSH_INTENT_KEY}:${userId}`) === '1'; } catch { return false; }
}
function writeIntent(userId: string, enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(`${PUSH_INTENT_KEY}:${userId}`, '1');
    else localStorage.removeItem(`${PUSH_INTENT_KEY}:${userId}`);
  } catch { /* */ }
}

export function usePushNotifications() {
  const { profile } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSubscription, setIsCheckingSubscription] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // Check if push notifications are supported
  useEffect(() => {
    const onDespia = isDespiaRuntime();
    const supported = onDespia || (
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window &&
      !isPreviewServiceWorkerDisabled()
    );
    setIsSupported(supported);

    if (!onDespia && supported) {
      setPermission(Notification.permission);
    }

    if (supported && profile) {
      // Hydrate from intent immediately so toggle doesn't flicker off on reload.
      setIsSubscribed(readIntent(profile.id));
      if (!onDespia) registerServiceWorker();
      checkSubscription();
    } else if (!profile) {
      setIsCheckingSubscription(false);
    }
  }, [profile]);

  // Register service worker
  const registerServiceWorker = async () => {
    try {
      const registration = await registerVybeServiceWorker();
      if (!registration) return null;
      registrationRef.current = registration;
      console.log('[Push] Service worker registered:', registration.scope);
      
      await navigator.serviceWorker.ready;
      console.log('[Push] Service worker ready');
      
      return registration;
    } catch (error) {
      console.error('[Push] Service worker registration failed:', error);
      return null;
    }
  };

  const checkSubscription = async () => {
    setIsCheckingSubscription(true);
    try {
      if (!profile) {
        setIsCheckingSubscription(false);
        return;
      }

      const platform = isDespiaRuntime() ? 'despia' : 'web';
      const intent = readIntent(profile.id);

      const { data, error } = await supabase
        .from('push_tokens')
        .select('id')
        .eq('user_id', profile.id)
        .eq('platform', platform)
        .maybeSingle();

      if (error) {
        console.error('[Push] Error checking subscription:', error);
        // Don't flip the toggle off on a transient read error — keep user intent.
        setIsCheckingSubscription(false);
        return;
      }

      // Source of truth = user intent. Toggle stays on until manually turned off.
      // If intent is on but the token row is missing, silently re-link in background.
      if (intent) {
        setIsSubscribed(true);
        if (!data && isDespiaRuntime()) {
          ensureDespiaOneSignalLinked(profile.id, {
            requestPermission: false,
            waitForPlayerIdMs: 2_000,
            persistToken: true,
          }).catch((err) => console.warn('[Push] background relink failed', err));
        }
      } else {
        setIsSubscribed(!!data);
      }

      // Web-only: reconcile with browser subscription (only if user hasn't opted in)
      if (!isDespiaRuntime() && registrationRef.current && !intent) {
        const subscription = await registrationRef.current.pushManager.getSubscription();
        if (!subscription && data) {
          await supabase
            .from('push_tokens')
            .delete()
            .eq('user_id', profile.id)
            .eq('platform', 'web');
          setIsSubscribed(false);
        }
      }
    } catch (error) {
      console.error('[Push] Error checking subscription:', error);
    } finally {
      setIsCheckingSubscription(false);
    }
  };

  const subscribeDespia = async (): Promise<boolean> => {
    if (!profile) return false;
    // OPTIMISTIC: flip the toggle on immediately and persist intent so the UI
    // never feels stuck waiting on Despia's native bridge (which can take 30s
    // to return nativePushEnabled and would otherwise leave the switch off).
    writeIntent(profile.id, true);
    setIsSubscribed(true);
    setPermission('granted');

    try {
      const { error: tokenError } = await supabase.from('push_tokens').upsert({
        user_id: profile.id,
        token: `despia:${profile.id}`,
        platform: 'despia',
      }, { onConflict: 'user_id,platform' });
      if (tokenError) {
        console.error('[Push] token upsert failed', tokenError);
        writeIntent(profile.id, false);
        setIsSubscribed(false);
        toast.error('Could not register this device for push. Try again.');
        return false;
      }
    } catch (err) {
      console.error('[Push] placeholder token insert failed', err);
      writeIntent(profile.id, false);
      setIsSubscribed(false);
      toast.error('Could not register this device for push. Try again.');
      return false;
    }

    const link = await ensureDespiaOneSignalLinked(profile.id, {
      requestPermission: true,
      waitForPlayerIdMs: 8_000,
      persistToken: true,
      trigger: 'permission-grant',
    });

    if (link.permission === false) {
      toast.error('Notifications are blocked. Enable them in Settings → VYBE → Notifications.');
      return false;
    }

    if (link.playerId) {
      await linkOneSignalUser(profile.id, link.playerId);
    } else {
      await linkOneSignalUser(profile.id);
    }

    if (!link.playerId) {
      toast.message('Push enabled — finishing device setup…', {
        description: 'If test push fails, toggle off and on once more.',
      });
    } else {
      toast.success('Push notifications enabled!');
    }
    return true;
  };

  const subscribe = useCallback(async () => {
    if (!profile) {
      toast.error('Please sign in to enable notifications');
      return false;
    }
    
    if (!isSupported) {
      toast.error('Push notifications not supported on this browser');
      return false;
    }

    setIsLoading(true);
    try {
      if (isDespiaRuntime()) {
        const ok = await subscribeDespia();
        return ok;
      }

      const oneSignalOk = await subscribeViaOneSignalWeb(profile.id);
      if (oneSignalOk) {
        writeIntent(profile.id, true);
        setIsSubscribed(true);
        toast.success('Push notifications enabled!');
        return true;
      }

      // Request notification permission
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      
      if (permissionResult !== 'granted') {
        toast.error('Please allow notifications in your browser settings');
        return false;
      }

      // Ensure service worker is registered
      let registration = registrationRef.current;
      if (!registration) {
        registration = await registerServiceWorker();
      }
      
      if (!registration) {
        throw new Error('Could not register service worker');
      }

      // Get the server's current VAPID public key (matches the private key it signs with)
      const vapidPublicKey = await fetchVapidPublicKey();

      // Reuse existing subscription if it was created with the SAME public key,
      // otherwise tear it down so we re-subscribe with the matching key.
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        try { await existing.unsubscribe(); } catch { /* */ }
      }

      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      console.log('[Push] Push subscription created:', subscription.endpoint);

      // Upsert subscription to database (avoids 409 on re-subscribe)
      const { error } = await supabase.from('push_tokens').upsert({
        user_id: profile.id,
        token: JSON.stringify(subscription.toJSON()),
        platform: 'web',
      }, { onConflict: 'user_id,platform' });

      if (error) {
        console.error('[Push] Error saving subscription:', error);
        throw error;
      }

      writeIntent(profile.id, true);
      setIsSubscribed(true);
      toast.success('Push notifications enabled!');
      return true;
    } catch (error: unknown) {
      console.error('[Push] Error subscribing:', error);
      
      // Handle specific errors
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        toast.error('Notifications blocked. Enable them in browser settings.');
      } else if (error instanceof DOMException && error.name === 'AbortError') {
        toast.error('Subscription was cancelled');
      } else {
        toast.error(getErrorMessage(error, 'Failed to enable notifications'));
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [profile, isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!profile) return false;

    setIsLoading(true);
    try {
      const onDespia = isDespiaRuntime();

      if (!onDespia && registrationRef.current) {
        const subscription = await registrationRef.current.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
          console.log('[Push] Unsubscribed from push');
        }
      }

      const { error } = await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', profile.id)
        .eq('platform', onDespia ? 'despia' : 'web');

      if (error) {
        console.error('[Push] Error removing token:', error);
        throw error;
      }

      writeIntent(profile.id, false);
      setIsSubscribed(false);
      toast.success('Push notifications disabled');
      return true;
    } catch (error: unknown) {
      console.error('[Push] Error unsubscribing:', error);
      toast.error(getErrorMessage(error, 'Failed to disable notifications'));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [profile]);

  // Request permission without subscribing
  const requestPermission = useCallback(async () => {
    if (!isSupported) return 'denied' as NotificationPermission;
    
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, [isSupported]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    isCheckingSubscription,
    permission,
    subscribe,
    unsubscribe,
    requestPermission,
  };
}
