import { useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { toast } from 'sonner';

// Check notification permission — never auto-request on web to avoid browser bell prompts
async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  // Don't auto-request — only return current state
  return false;
}

// Show native browser notification
function showNativeNotification(title: string, body: string, url?: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  
  const notification = new Notification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'vybe-notification',
  });

  notification.onclick = () => {
    window.focus();
    if (url) window.location.href = url;
    notification.close();
  };
}

export type NotificationType = 'like' | 'comment' | 'follow' | 'friend_request' | 'friend_accepted' | 'friend_declined' | 'message' | 'mention' | 'missed_call' | 'announcement' | 'content_removed' | 'smart_ping';

interface Notification {
  id: string;
  type: NotificationType;
  read: boolean;
  created_at: string;
  post_id: string | null;
  reason: string | null;
  // Smart-ping fields
  title?: string | null;
  body?: string | null;
  image_url?: string | null;
  deep_link?: string | null;
  subtype?: string | null;
  meta?: any;
  actor: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

export function useNotifications() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', profileId],
    queryFn: async (): Promise<Notification[]> => {
      if (!profileId) return [];

      // Use a simpler query structure for faster loading
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          id,
          type,
          read,
          created_at,
          post_id,
          actor_id,
          reason,
          title,
          body,
          image_url,
          deep_link,
          subtype,
          meta
        `)
        .eq('user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Hide stale Daily Brief pings (>24h old) — they're time-sensitive
      const DAY_MS = 24 * 60 * 60 * 1000;
      const now = Date.now();
      const filtered = data.filter((n: any) => {
        if (n.subtype === 'brief_item') {
          return now - new Date(n.created_at).getTime() < DAY_MS;
        }
        return true;
      });
      if (filtered.length === 0) return [];

      // Batch fetch all unique actor profiles in one query
      const actorIds = [...new Set(filtered.map(n => n.actor_id))];
      const { data: actors } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, display_name')
        .in('id', actorIds);

      const actorMap = new Map(actors?.map(a => [a.id, a]) || []);

      return filtered.map(n => ({
        id: n.id,
        type: n.type as NotificationType,
        read: n.read,
        created_at: n.created_at,
        post_id: n.post_id,
        reason: (n as any).reason || null,
        title: (n as any).title || null,
        body: (n as any).body || null,
        image_url: (n as any).image_url || null,
        deep_link: (n as any).deep_link || null,
        subtype: (n as any).subtype || null,
        meta: (n as any).meta || null,
        actor: actorMap.get(n.actor_id) || {
          id: n.actor_id,
          username: 'unknown',
          avatar_url: null,
          display_name: null,
        },
      }));
    },
    enabled: !!profileId,
    staleTime: 60000, // Cache for 1 minute
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    networkMode: 'always',
  });

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!profileId) return;

    const channel = subscribePostgresChannel(`notifications:${profileId}`, [
      {
        event: 'INSERT',
        table: 'notifications',
        filter: `user_id=eq.${profileId}`,
        callback: async (payload) => {
          if (payload.new.actor_id === profileId) {
            return;
          }

          const { data: actor } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', payload.new.actor_id)
            .single();

          const type = payload.new.type as NotificationType;
          const messages: Record<NotificationType, string> = {
            like: 'liked your post',
            comment: 'commented on your post',
            follow: 'started following you',
            friend_request: 'sent you a friend request',
            friend_accepted: 'accepted your friend request',
            friend_declined: 'declined your friend request',
            message: 'sent you a message',
            mention: 'mentioned you',
            missed_call: 'tried to call you',
            announcement: 'posted an announcement',
            content_removed: 'removed your content',
            smart_ping: 'sent you a smart ping',
          };

          const message = `${actor?.username || 'Someone'} ${messages[type] || 'interacted with you'}`;
          
          toast.info(message, { duration: 4000 });
          
          if (document.hidden) {
            showNativeNotification('VYBE', message, type === 'message' ? '/messages' : '/notifications');
          }

          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [profileId, queryClient]);

  return query;
}

export function useMarkNotificationsRead() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!profileId) return;

      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', profileId)
        .eq('read', false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
    },
  });
}

export function useUnreadCount() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['unread-notifications', profileId],
    queryFn: async () => {
      if (!profileId) return 0;

      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profileId)
        .eq('read', false);

      return count || 0;
    },
    enabled: !!profileId,
    staleTime: 60000, // Cache for 1 minute
    gcTime: 1000 * 60 * 10,
    refetchInterval: 60000, // Poll every minute instead of 30s
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function usePendingFriendRequestCount() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['pending-friend-requests-count', profileId],
    queryFn: async () => {
      if (!profileId) return 0;

      const { count } = await supabase
        .from('friend_requests')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', profileId)
        .eq('status', 'pending');

      return count || 0;
    },
    enabled: !!profileId,
    staleTime: 30000,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
}
