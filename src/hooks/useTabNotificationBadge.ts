import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useUnreadMessagesCount } from '@/hooks/useMessages';
import { useUnreadCount } from '@/hooks/useNotifications';

/**
 * Discord/Snapchat-style Tab Notification Badge
 *
 * Updates the browser tab title to show unread counts.
 * Uses a SINGLE realtime channel instead of 3 separate ones.
 * Shares the ['unread-notifications'] query with the sidebar badges —
 * previously this hook ran an identical duplicate query on its own key.
 */

const ORIGINAL_TITLE = 'VYBE';
const MAX_DISPLAY_COUNT = 99;

export function useTabNotificationBadge() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const { data: unreadNotifications = 0 } = useUnreadCount();
  const previousCountRef = useRef<number>(0);
  const flashIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const totalUnread = unreadMessages + unreadNotifications;

  useEffect(() => {
    if (flashIntervalRef.current) {
      clearInterval(flashIntervalRef.current);
      flashIntervalRef.current = null;
    }

    if (totalUnread > 0) {
      const displayCount = totalUnread > MAX_DISPLAY_COUNT
        ? `${MAX_DISPLAY_COUNT}+`
        : totalUnread.toString();

      document.title = `(${displayCount}) ${ORIGINAL_TITLE}`;

      if (totalUnread > previousCountRef.current && previousCountRef.current > 0) {
        let isFlashing = true;
        flashIntervalRef.current = setInterval(() => {
          document.title = isFlashing
            ? `💬 ${ORIGINAL_TITLE}`
            : `(${displayCount}) ${ORIGINAL_TITLE}`;
          isFlashing = !isFlashing;
        }, 500);

        setTimeout(() => {
          if (flashIntervalRef.current) {
            clearInterval(flashIntervalRef.current);
            flashIntervalRef.current = null;
          }
          if (totalUnread > 0) {
            const currentCount = totalUnread > MAX_DISPLAY_COUNT
              ? `${MAX_DISPLAY_COUNT}+`
              : totalUnread.toString();
            document.title = `(${currentCount}) ${ORIGINAL_TITLE}`;
          }
        }, 3000);
      }
    } else {
      document.title = ORIGINAL_TITLE;
    }

    previousCountRef.current = totalUnread;

    return () => {
      if (flashIntervalRef.current) {
        clearInterval(flashIntervalRef.current);
      }
    };
  }, [totalUnread]);

  useEffect(() => {
    if (!profileId) return;

    const channel = subscribePostgresChannel('tab-badge-consolidated', [
      {
        event: 'INSERT',
        table: 'notifications',
        filter: `user_id=eq.${profileId}`,
        callback: () => {
          queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
        },
      },
      {
        event: 'UPDATE',
        table: 'conversation_members',
        filter: `user_id=eq.${profileId}`,
        callback: () => {
          queryClient.invalidateQueries({ queryKey: ['unread-messages-count'] });
        },
      },
      {
        event: 'UPDATE',
        table: 'notifications',
        filter: `user_id=eq.${profileId}`,
        callback: () => {
          queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [profileId, queryClient]);

  useEffect(() => {
    const handleUnload = () => {
      document.title = ORIGINAL_TITLE;
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  return { totalUnread, unreadMessages, unreadNotifications };
}
