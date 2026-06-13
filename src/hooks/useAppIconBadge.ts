import { useEffect } from 'react';
import { useUnreadMessagesCount } from '@/hooks/useMessages';
import { useUnreadCount } from '@/hooks/useNotifications';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { setAppIconBadge } from '@/lib/appIconBadge';

/**
 * Keeps the app icon badge in sync with unread messages + notifications.
 */
export function useAppIconBadge() {
  const profileId = useAuthProfileId();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const { data: unreadNotifications = 0 } = useUnreadCount();

  const totalUnread = unreadMessages + unreadNotifications;

  useEffect(() => {
    if (!profileId) {
      void setAppIconBadge(0);
      return;
    }
    void setAppIconBadge(totalUnread);
  }, [profileId, totalUnread]);
}
