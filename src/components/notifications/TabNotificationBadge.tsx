import { useTabNotificationBadge } from '@/hooks/useTabNotificationBadge';

/**
 * Global Tab Notification Badge Component
 * 
 * Renders nothing but keeps the tab title updated with unread counts.
 * Place this once at the app root level.
 */
export function TabNotificationBadge() {
  // This hook handles all the tab title updates
  useTabNotificationBadge();
  
  return null;
}
