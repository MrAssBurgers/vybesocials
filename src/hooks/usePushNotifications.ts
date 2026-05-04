import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { isPreviewServiceWorkerDisabled } from '@/lib/serviceWorker';
import despia from 'despia-native';

function isDespiaWebView(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('despia') || ua.includes('vybeapp');
}

// VAPID public key - this must match the VAPID_PUBLIC_KEY secret in Supabase
// Generate a new key pair with: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

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
      
      const { data, error } = await supabase
        .from('push_tokens')
        .select('id')
        .eq('user_id', profile.id)
        .eq('platform', 'web')
        .maybeSingle();
      
      if (error) {
        console.error('[Push] Error checking subscription:', error);
        setIsCheckingSubscription(false);
        return;
      }
      
      setIsSubscribed(!!data);
      
      // Also check browser subscription status
      if (registrationRef.current) {
        const subscription = await (registrationRef.current as any).pushManager.getSubscription();
        if (!subscription && data) {
          // DB says subscribed but browser isn't - clean up
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

      // Subscribe to push notifications
      const subscription = await (registration as any).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
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
    } catch (error: any) {
      console.error('[Push] Error subscribing:', error);
      
      // Handle specific errors
      if (error.name === 'NotAllowedError') {
        toast.error('Notifications blocked. Enable them in browser settings.');
      } else if (error.name === 'AbortError') {
        toast.error('Subscription was cancelled');
      } else {
        toast.error(error?.message || 'Failed to enable notifications');
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
      // Unsubscribe from push
      if (registrationRef.current) {
        const subscription = await (registrationRef.current as any).pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
          console.log('[Push] Unsubscribed from push');
        }
      }

      // Remove from database
      const { error } = await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', profile.id)
        .eq('platform', 'web');

      if (error) {
        console.error('[Push] Error removing token:', error);
        throw error;
      }

      setIsSubscribed(false);
      toast.success('Push notifications disabled');
      return true;
    } catch (error: any) {
      console.error('[Push] Error unsubscribing:', error);
      toast.error(error?.message || 'Failed to disable notifications');
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
