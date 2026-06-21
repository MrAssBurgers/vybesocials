import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useUnreadMessagesCount } from '@/hooks/useMessages';

/**
 * Discord/Snapchat-style Tab Notification Badge
 *
 * Updates the browser tab title to show unread counts.
 * Uses a SINGLE realtime channel instead of 3 separate ones.
 */

const ORIGINAL_TITLE = 'VYBE';
const MAX_DISPLAY_COUNT = 99;

function useUnreadNotificationsCount() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['unread-notifications-count', profileId],
    queryFn: async () => {
      if (!profileId) return 0;

      const { count } = await db
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profileId)
        .eq('read', false);

      return count || 0;
    },
    enabled: !!profileId,
    staleTime: 30000,
    gcTime: 1000 * 60 * 5,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });
}

export function useTabNotificationBadge() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const { data: unreadNotifications = 0 } = useUnreadNotificationsCount();
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
          queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
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
          queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
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
