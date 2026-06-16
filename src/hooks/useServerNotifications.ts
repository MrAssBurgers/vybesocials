import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';

interface ServerNotification {
  id: string;
  user_id: string;
  server_id: string;
  channel_id: string;
  message_id: string;
  sender_id: string;
  created_at: string;
  read: boolean;
}

// Get total unread count for all servers
export function useUnreadServerNotificationsCount() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['unread-server-notifications-count', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;

      const { count, error } = await db
        .from('server_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('read', false);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!profile?.id,
    staleTime: 5000,
    refetchInterval: 15000,
  });
}

// Get unread count per server
export function useUnreadCountPerServer() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['unread-per-server', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return {};

      const { data, error } = await db
        .from('server_notifications')
        .select('server_id')
        .eq('user_id', profile.id)
        .eq('read', false);

      if (error) throw error;

      // Count by server_id
      const counts: Record<string, number> = {};
      (data || []).forEach((n) => {
        counts[n.server_id] = (counts[n.server_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!profile?.id,
    staleTime: 5000,
  });

  // Subscribe to realtime updates
  useEffect(() => {
    if (!profile?.id) return;

    const channel = subscribePostgresChannel(`server-notifications:${profile.id}`, [
      {
        event: '*',
        table: 'server_notifications',
        filter: `user_id=eq.${profile.id}`,
        callback: () => {
          queryClient.invalidateQueries({ queryKey: ['unread-per-server'] });
          queryClient.invalidateQueries({ queryKey: ['unread-server-notifications-count'] });
          queryClient.invalidateQueries({ queryKey: ['unread-per-channel'] });
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [profile?.id, queryClient]);

  return query;
}

// Get unread count per channel
export function useUnreadCountPerChannel(serverId: string | undefined) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['unread-per-channel', serverId, profile?.id],
    queryFn: async () => {
      if (!profile?.id || !serverId) return {};

      const { data, error } = await db
        .from('server_notifications')
        .select('channel_id')
        .eq('user_id', profile.id)
        .eq('server_id', serverId)
        .eq('read', false);

      if (error) throw error;

      // Count by channel_id
      const counts: Record<string, number> = {};
      (data || []).forEach((n) => {
        counts[n.channel_id] = (counts[n.channel_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!profile?.id && !!serverId,
    staleTime: 5000,
  });
}

// Mark channel notifications as read
export function useMarkChannelRead() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (channelId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await db
        .from('server_notifications')
        .update({ read: true })
        .eq('user_id', profile.id)
        .eq('channel_id', channelId)
        .eq('read', false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unread-per-server'] });
      queryClient.invalidateQueries({ queryKey: ['unread-per-channel'] });
      queryClient.invalidateQueries({ queryKey: ['unread-server-notifications-count'] });
    },
  });
}

// Mark all server notifications as read
export function useMarkServerRead() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (serverId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await db
        .from('server_notifications')
        .update({ read: true })
        .eq('user_id', profile.id)
        .eq('server_id', serverId)
        .eq('read', false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unread-per-server'] });
      queryClient.invalidateQueries({ queryKey: ['unread-per-channel'] });
      queryClient.invalidateQueries({ queryKey: ['unread-server-notifications-count'] });
    },
  });
}
