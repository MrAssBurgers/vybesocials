import { useMessageNotifications, useCrossDeviceSync } from '@/hooks/useMessageNotifications';

/**
 * Global Message Notifications Provider
 * Enables instant DM notifications app-wide
 */
export function GlobalMessageNotifications() {
  // Enable instant message notifications
  useMessageNotifications();
  
  // Enable cross-device read sync
  useCrossDeviceSync();
  
  return null;
}
