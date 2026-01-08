import { useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export function usePresence() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Update presence on mount and periodically
  const updatePresence = useCallback(async () => {
    if (!profile?.id) return;

    try {
      await supabase
        .from('user_presence')
        .upsert({
          user_id: profile.id,
          is_online: true,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    } catch (error) {
      console.error('Failed to update presence:', error);
    }
  }, [profile?.id]);

  // Set offline on unmount
  const setOffline = useCallback(async () => {
    if (!profile?.id) return;

    try {
      await supabase
        .from('user_presence')
        .upsert({
          user_id: profile.id,
          is_online: false,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    } catch (error) {
      console.error('Failed to set offline:', error);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;

    // Set online immediately
    updatePresence();

    // Update presence every 30 seconds
    const interval = setInterval(updatePresence, 30000);

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updatePresence();
      } else {
        setOffline();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Handle beforeunload
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable offline status
      navigator.sendBeacon?.(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_presence?user_id=eq.${profile.id}`,
        JSON.stringify({ is_online: false, last_seen_at: new Date().toISOString() })
      );
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      setOffline();
    };
  }, [profile?.id, updatePresence, setOffline]);

  return { updatePresence, setOffline };
}

// Hook to check if a specific user is online
export function useUserOnlineStatus(userId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['user-presence', userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from('user_presence')
        .select('is_online, last_seen_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      // Consider user offline if last seen more than 2 minutes ago
      if (data?.is_online) {
        const lastSeen = new Date(data.last_seen_at);
        const now = new Date();
        const diffMs = now.getTime() - lastSeen.getTime();
        if (diffMs > 2 * 60 * 1000) {
          return { is_online: false, last_seen_at: data.last_seen_at };
        }
      }

      return data;
    },
    enabled: !!userId,
    staleTime: 10000,
    refetchInterval: 30000,
  });

  // Subscribe to realtime updates
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`presence:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['user-presence', userId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  return query;
}

// Hook to get multiple users' online status
export function useUsersOnlineStatus(userIds: string[]) {
  return useQuery({
    queryKey: ['users-presence', userIds.sort().join(',')],
    queryFn: async () => {
      if (!userIds.length) return {};

      const { data, error } = await supabase
        .from('user_presence')
        .select('user_id, is_online, last_seen_at')
        .in('user_id', userIds);

      if (error) throw error;

      const now = new Date();
      const statusMap: Record<string, boolean> = {};

      (data || []).forEach((p) => {
        let isOnline = p.is_online;
        if (isOnline) {
          const lastSeen = new Date(p.last_seen_at);
          const diffMs = now.getTime() - lastSeen.getTime();
          if (diffMs > 2 * 60 * 1000) {
            isOnline = false;
          }
        }
        statusMap[p.user_id] = isOnline;
      });

      return statusMap;
    },
    enabled: userIds.length > 0,
    staleTime: 10000,
    refetchInterval: 30000,
  });
}
