import { useEffect, useCallback, useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { isNativePlatform, hapticImpact, hapticNotification } from '@/lib/capacitor';

export function useNativeCamera() {
  const takePhoto = useCallback(async () => {
    if (!isNativePlatform) {
      // Fallback to web file input
      return null;
    }

    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: true,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera
      });

      await hapticImpact('light');
      return image.webPath;
    } catch (error) {
      console.error('[Camera] Failed to take photo:', error);
      return null;
    }
  }, []);

  const pickFromGallery = useCallback(async () => {
    if (!isNativePlatform) {
      return null;
    }

    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: true,
        resultType: CameraResultType.Uri,
        source: CameraSource.Photos
      });

      await hapticImpact('light');
      return image.webPath;
    } catch (error) {
      console.error('[Camera] Failed to pick image:', error);
      return null;
    }
  }, []);

  return { takePhoto, pickFromGallery, isNative: isNativePlatform };
}

export function useNativeShare() {
  const share = useCallback(async (options: {
    title?: string;
    text?: string;
    url?: string;
    files?: string[];
  }) => {
    try {
      if (isNativePlatform) {
        await Share.share({
          title: options.title,
          text: options.text,
          url: options.url,
          dialogTitle: 'Share via'
        });
        await hapticImpact('light');
      } else if (navigator.share) {
        await navigator.share({
          title: options.title,
          text: options.text,
          url: options.url
        });
      } else {
        // Fallback: copy to clipboard
        if (options.url) {
          await navigator.clipboard.writeText(options.url);
        }
      }
      return true;
    } catch (error) {
      console.error('[Share] Failed:', error);
      return false;
    }
  }, []);

  const canShare = isNativePlatform || !!navigator.share;

  return { share, canShare };
}

export function useNativeNotifications() {
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    if (!isNativePlatform) return;

    const checkPermission = async () => {
      const result = await LocalNotifications.checkPermissions();
      setHasPermission(result.display === 'granted');
    };

    checkPermission();
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isNativePlatform) return false;

    try {
      const result = await LocalNotifications.requestPermissions();
      const granted = result.display === 'granted';
      setHasPermission(granted);
      return granted;
    } catch (error) {
      console.error('[Notifications] Permission request failed:', error);
      return false;
    }
  }, []);

  const scheduleNotification = useCallback(async (options: {
    title: string;
    body: string;
    id?: number;
    schedule?: { at: Date };
  }) => {
    if (!isNativePlatform || !hasPermission) return false;

    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: options.id || Date.now(),
          title: options.title,
          body: options.body,
          schedule: options.schedule
        }]
      });
      return true;
    } catch (error) {
      console.error('[Notifications] Schedule failed:', error);
      return false;
    }
  }, [hasPermission]);

  return { hasPermission, requestPermission, scheduleNotification };
}

export function useNativePushNotifications() {
  const [token, setToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt');

  useEffect(() => {
    if (!isNativePlatform) return;

    const setupPush = async () => {
      try {
        // Check current permission status
        const permResult = await PushNotifications.checkPermissions();
        setPermissionStatus(permResult.receive as 'prompt' | 'granted' | 'denied');

        // Request permission
        const result = await PushNotifications.requestPermissions();
        setPermissionStatus(result.receive as 'prompt' | 'granted' | 'denied');
        if (result.receive !== 'granted') return;

        // Register for push
        await PushNotifications.register();

        // Listen for registration token
        PushNotifications.addListener('registration', (regToken) => {
          setToken(regToken.value);
          console.log('[Push Native] Token registered:', regToken.value.substring(0, 20) + '...');
        });

        // Handle registration error
        PushNotifications.addListener('registrationError', (error) => {
          console.error('[Push Native] Registration error:', error);
        });

        // Handle push received while app is in foreground
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[Push Native] Foreground notification:', notification);
          
          // Haptic feedback based on notification type
          const notifType = notification.data?.type || 'general';
          if (notifType === 'call') {
            hapticNotification('warning');
          } else if (notifType === 'dm' || notifType === 'message') {
            hapticNotification('success');
          } else {
            hapticImpact('medium');
          }
        });

        // Handle notification tap - deep link to correct screen
        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          console.log('[Push Native] Action performed:', action);
          const data = action.notification.data || {};
          
          let targetUrl = data.url || '/';
          
          // Deep link based on notification type
          switch (data.type) {
            case 'dm':
            case 'message':
            case 'group_message':
              targetUrl = data.conversationId ? `/messages/${data.conversationId}` : '/messages';
              break;
            case 'call':
              targetUrl = data.conversationId ? `/messages/${data.conversationId}?acceptCall=true` : '/messages';
              break;
            case 'friend_request':
            case 'friend_accepted':
              targetUrl = '/notifications';
              break;
            case 'like':
            case 'comment':
              targetUrl = data.postId ? `/p/${data.postId}` : '/notifications';
              break;
            case 'marketplace':
              targetUrl = '/marketplace';
              break;
            case 'wallet':
            case 'tokens':
              targetUrl = '/wallet';
              break;
            case 'dna':
              targetUrl = '/vybe-dna';
              break;
            case 'space':
              targetUrl = data.spaceId ? `/space/${data.spaceId}` : '/spaces';
              break;
          }
          
          // Navigate using the window location (works in Capacitor WebView)
          if (targetUrl && targetUrl !== '/') {
            window.location.href = targetUrl;
          }
        });

        // Reset badge count when app is opened
        try {
          await PushNotifications.removeAllDeliveredNotifications();
        } catch {
          // Not supported on all platforms
        }
      } catch (error) {
        console.error('[Push Native] Setup failed:', error);
      }
    };

    setupPush();

    return () => {
      PushNotifications.removeAllListeners();
    };
  }, []);

  // Clear badge count when app becomes visible
  useEffect(() => {
    if (!isNativePlatform) return;

    const handleVisibility = () => {
      if (!document.hidden) {
        PushNotifications.removeAllDeliveredNotifications().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return { token, isNative: isNativePlatform, permissionStatus };
}

export function useNativeFileSystem() {
  const saveFile = useCallback(async (options: {
    data: string;
    fileName: string;
    directory?: Directory;
  }) => {
    if (!isNativePlatform) return null;

    try {
      const result = await Filesystem.writeFile({
        path: options.fileName,
        data: options.data,
        directory: options.directory || Directory.Documents
      });
      return result.uri;
    } catch (error) {
      console.error('[Filesystem] Save failed:', error);
      return null;
    }
  }, []);

  const readFile = useCallback(async (options: {
    path: string;
    directory?: Directory;
  }) => {
    if (!isNativePlatform) return null;

    try {
      const result = await Filesystem.readFile({
        path: options.path,
        directory: options.directory || Directory.Documents
      });
      return result.data;
    } catch (error) {
      console.error('[Filesystem] Read failed:', error);
      return null;
    }
  }, []);

  return { saveFile, readFile, isNative: isNativePlatform };
}
