import { useMessageNotifications, useCrossDeviceSync } from '@/hooks/useMessageNotifications';
import { useNotificationChatPrefetch } from '@/hooks/useChatPrefetch';

/**
 * Global Message Notifications Provider
 * Enables instant DM notifications app-wide and prefetches chat data
 */
export function GlobalMessageNotifications() {
  // Enable instant message notifications
  useMessageNotifications();
  
  // Enable cross-device read sync
  useCrossDeviceSync();
  
  // Enable notification → chat prefetching for instant transitions
  useNotificationChatPrefetch();
  
  return null;
}
