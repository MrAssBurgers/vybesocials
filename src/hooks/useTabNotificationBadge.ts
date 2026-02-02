import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

/**
 * Discord/Snapchat-style Tab Notification Badge
 * 
 * Updates the browser tab title to show unread counts:
 * - No unreads: "VYBE"
 * - With unreads: "(5) VYBE"
 * - 99+ for large counts: "(99+) VYBE"
 * 
 * Also flashes the title for new messages (optional)
 */

const ORIGINAL_TITLE = 'VYBE';
const MAX_DISPLAY_COUNT = 99;

// Get total unread messages count
function useUnreadMessagesCount() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['unread-messages-count', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;

      // Get all conversations user is a member of
      const { data: memberships } = await supabase
        .from('conversation_members')
        .select('conversation_id, last_read_at')
        .eq('user_id', profile.id);

      if (!memberships || memberships.length === 0) return 0;

      let totalUnread = 0;

      // For each conversation, count unread messages
      for (const membership of memberships) {
        const query = supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', membership.conversation_id)
          .neq('sender_id', profile.id)
          .is('deleted_at', null);

        // Only count messages after last_read_at if set
        if (membership.last_read_at) {
          query.gt('created_at', membership.last_read_at);
        }

        const { count } = await query;
        totalUnread += count || 0;
      }

      return totalUnread;
    },
    enabled: !!profile?.id,
    staleTime: 30000, // 30 seconds
    gcTime: 1000 * 60 * 5, // 5 minutes
    refetchInterval: 60000, // Refresh every minute
    refetchOnWindowFocus: true,
  });
}

// Get unread notifications count  
function useUnreadNotificationsCount() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['unread-notifications-count', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;

      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('read', false);

      return count || 0;
    },
    enabled: !!profile?.id,
    staleTime: 30000,
    gcTime: 1000 * 60 * 5,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });
}

export function useTabNotificationBadge() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const { data: unreadNotifications = 0 } = useUnreadNotificationsCount();
  const previousCountRef = useRef<number>(0);
  const flashIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate total unread
  const totalUnread = unreadMessages + unreadNotifications;

  // Update document title based on unread count
  useEffect(() => {
    // Clear any existing flash interval
    if (flashIntervalRef.current) {
      clearInterval(flashIntervalRef.current);
      flashIntervalRef.current = null;
    }

    if (totalUnread > 0) {
      const displayCount = totalUnread > MAX_DISPLAY_COUNT 
        ? `${MAX_DISPLAY_COUNT}+` 
        : totalUnread.toString();
      
      document.title = `(${displayCount}) ${ORIGINAL_TITLE}`;

      // Flash effect when count increases (new notification)
      if (totalUnread > previousCountRef.current && previousCountRef.current > 0) {
        let isFlashing = true;
        flashIntervalRef.current = setInterval(() => {
          document.title = isFlashing 
            ? `💬 ${ORIGINAL_TITLE}` 
            : `(${displayCount}) ${ORIGINAL_TITLE}`;
          isFlashing = !isFlashing;
        }, 500);

        // Stop flashing after 3 seconds
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

    // Cleanup on unmount
    return () => {
      if (flashIntervalRef.current) {
        clearInterval(flashIntervalRef.current);
      }
    };
  }, [totalUnread]);

  // Listen for real-time updates to refresh counts
  useEffect(() => {
    if (!profile?.id) return;

    // Listen for new messages
    const messagesChannel = supabase
      .channel('tab-badge-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          // Only refresh if message is not from current user
          if (payload.new.sender_id !== profile.id) {
            queryClient.invalidateQueries({ queryKey: ['unread-messages-count'] });
          }
        }
      )
      .subscribe();

    // Listen for new notifications
    const notificationsChannel = supabase
      .channel('tab-badge-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
        }
      )
      .subscribe();

    // Listen for read state changes
    const readChannel = supabase
      .channel('tab-badge-read-state')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_members',
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['unread-messages-count'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['unread-notifications-count'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(notificationsChannel);
      supabase.removeChannel(readChannel);
    };
  }, [profile?.id, queryClient]);

  // Reset title on page unload
  useEffect(() => {
    const handleUnload = () => {
      document.title = ORIGINAL_TITLE;
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  return { totalUnread, unreadMessages, unreadNotifications };
}
