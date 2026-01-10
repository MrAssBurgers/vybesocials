import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export function usePushNotifications() {
  const { profile } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check if push notifications are supported
  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsSupported(supported);

    if (supported && profile) {
      checkSubscription();
    }
  }, [profile]);

  const checkSubscription = async () => {
    try {
      // Check if we have a token in DB
      if (profile) {
        const { data } = await supabase
          .from('push_tokens')
          .select('id')
          .eq('user_id', profile.id)
          .eq('platform', 'web')
          .maybeSingle();
        
        setIsSubscribed(!!data);
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  };

  const subscribe = useCallback(async () => {
    if (!profile || !isSupported) {
      toast.error('Push notifications not supported on this device');
      return false;
    }

    setIsLoading(true);
    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Please allow notifications in your browser settings');
        return false;
      }

      // For now, just save permission granted - full push requires VAPID keys
      // Delete existing token if any
      await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', profile.id)
        .eq('platform', 'web');

      // Insert new token
      const { error } = await supabase.from('push_tokens').insert({
        user_id: profile.id,
        token: 'browser-notification-granted',
        platform: 'web',
      });

      if (error) throw error;

      setIsSubscribed(true);
      toast.success('Notifications enabled!');
      return true;
    } catch (error) {
      console.error('Error subscribing to notifications:', error);
      toast.error('Failed to enable notifications');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [profile, isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!profile) return false;

    setIsLoading(true);
    try {
      // Remove from database
      await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', profile.id)
        .eq('platform', 'web');

      setIsSubscribed(false);
      toast.success('Notifications disabled');
      return true;
    } catch (error) {
      console.error('Error unsubscribing:', error);
      toast.error('Failed to disable notifications');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [profile]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  };
}
