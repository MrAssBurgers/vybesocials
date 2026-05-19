import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { isPreviewServiceWorkerDisabled } from '@/lib/serviceWorker';
import { checkDespiaPushPermission, ensureDespiaOneSignalLinked } from '@/lib/despiaOneSignal';

function isDespiaWebView(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('despia') || ua.includes('vybeapp');
}

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
    const onDespia = isDespiaWebView();
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
      if (!onDespia) registerServiceWorker();
      checkSubscription();
    } else if (!profile) {
      setIsCheckingSubscription(false);
    }
  }, [profile]);

  // Register service worker
  const registerServiceWorker = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      registrationRef.current = registration;
      console.log('[Push] Service worker registered:', registration.scope);
      
      // Wait for the service worker to be ready
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

      const platform = isDespiaWebView() ? 'despia' : 'web';

      const { data, error } = await supabase
        .from('push_tokens')
        .select('id')
        .eq('user_id', profile.id)
        .eq('platform', platform)
        .maybeSingle();

      if (error) {
        console.error('[Push] Error checking subscription:', error);
        setIsCheckingSubscription(false);
        return;
      }

      if (isDespiaWebView()) {
        const nativePermission = await checkDespiaPushPermission();
        setIsSubscribed(Boolean(data) && nativePermission !== false);
        setPermission(nativePermission === false ? 'denied' : nativePermission === true ? 'granted' : 'default');
        return;
      }

      setIsSubscribed(!!data);

      // Web-only: reconcile with browser subscription
      if (!isDespiaWebView() && registrationRef.current) {
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
    try {
      const link = await ensureDespiaOneSignalLinked(profile.id, {
        requestPermission: true,
        refreshRegistration: true,
        waitForPlayerIdMs: 4_000,
        persistToken: true,
      });
      if (!link.linked) throw new Error('Open the app in Despia to enable push notifications.');

      // Persist token row optimistically so the toggle reflects subscribed state.
      // OneSignal handles delivery server-side once the user accepts.
      await supabase.from('push_tokens').delete()
        .eq('user_id', profile.id).eq('platform', 'despia');
      const { error } = await supabase.from('push_tokens').insert({
        user_id: profile.id,
        token: link.playerId || `despia:${profile.id}`,
        platform: 'despia',
      });
      if (error) throw error;

      setIsSubscribed(true);
      setPermission('granted');
      toast.success('Push notifications enabled!');
      return true;
    } catch (e: unknown) {
      console.error('[Push] Despia subscribe failed:', e);
      toast.error(getErrorMessage(e, 'Failed to enable notifications'));
      return false;
    }
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
      if (isDespiaWebView()) {
        const ok = await subscribeDespia();
        return ok;
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

      // Delete existing token if any
      await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', profile.id)
        .eq('platform', 'web');

      // Save subscription to database
      const { error } = await supabase.from('push_tokens').insert({
        user_id: profile.id,
        token: JSON.stringify(subscription.toJSON()),
        platform: 'web',
      });

      if (error) {
        console.error('[Push] Error saving subscription:', error);
        throw error;
      }

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
      const onDespia = isDespiaWebView();

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
