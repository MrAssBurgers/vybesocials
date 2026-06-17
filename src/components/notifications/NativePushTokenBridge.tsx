import { useNativePushNotifications } from '@/hooks/useNativeFeatures';

/** Registers Capacitor FCM + VoIP tokens into push_tokens on native builds. */
export function NativePushTokenBridge() {
  useNativePushNotifications();
  return null;
}
