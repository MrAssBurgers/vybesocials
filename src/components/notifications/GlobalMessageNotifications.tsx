import { useCrossDeviceSync } from '@/hooks/useMessageNotifications';
import { useNotificationChatPrefetch } from '@/hooks/useChatPrefetch';

/**
 * Cross-device read sync + notification → chat prefetch.
 * Foreground DM alerts come from dmScopedMessageRealtime → foregroundDmNotification.
 */
export function GlobalMessageNotifications() {
  useCrossDeviceSync();
  useNotificationChatPrefetch();
  return null;
}
