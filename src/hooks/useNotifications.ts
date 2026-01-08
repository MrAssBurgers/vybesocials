import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export type NotificationType = 'like' | 'comment' | 'follow' | 'friend_request' | 'friend_accepted' | 'message' | 'mention';

interface Notification {
  id: string;
  type: NotificationType;
  read: boolean;
  created_at: string;
  post_id: string | null;
  actor: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

export function useNotifications() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', profile?.id],
    queryFn: async (): Promise<Notification[]> => {
      if (!profile) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select(`
          id,
          type,
          read,
          created_at,
          post_id,
          actor:profiles!actor_id (
            id,
            username,
            avatar_url,
            display_name
          )
        `)
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      return (data || []).map(n => ({
        ...n,
        type: n.type as NotificationType,
        actor: n.actor as unknown as Notification['actor'],
      }));
    },
    enabled: !!profile,
    staleTime: 10000, // Cache for 10 seconds
  });

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        async (payload) => {
          // Fetch the actor details
          const { data: actor } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', payload.new.actor_id)
            .single();

          // Show toast for new notification
          const type = payload.new.type as NotificationType;
          const messages: Record<NotificationType, string> = {
            like: 'liked your post',
            comment: 'commented on your post',
            follow: 'started following you',
            friend_request: 'sent you a friend request',
            friend_accepted: 'accepted your friend request',
            message: 'sent you a message',
            mention: 'mentioned you',
          };

          toast.info(`${actor?.username || 'Someone'} ${messages[type] || 'interacted with you'}`, {
            duration: 4000,
          });

          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, queryClient]);

  return query;
}

export function useMarkNotificationsRead() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!profile) return;

      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', profile.id)
        .eq('read', false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
    },
  });
}

export function useUnreadCount() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['unread-notifications', profile?.id],
    queryFn: async () => {
      if (!profile) return 0;

      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('read', false);

      return count || 0;
    },
    enabled: !!profile,
    staleTime: 5000,
    refetchInterval: 15000,
  });
}

export function usePendingFriendRequestCount() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['pending-friend-requests-count', profile?.id],
    queryFn: async () => {
      if (!profile) return 0;

      const { count } = await supabase
        .from('friend_requests')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', profile.id)
        .eq('status', 'pending');

      return count || 0;
    },
    enabled: !!profile,
    staleTime: 10000,
  });
}
