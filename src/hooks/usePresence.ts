import { useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

// Debug flag - set to true for dev debugging
const DEBUG_PRESENCE = import.meta.env.DEV;

function logPresence(...args: any[]) {
  if (DEBUG_PRESENCE) {
    console.log('[Presence]', ...args);
  }
}

export function usePresence() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update presence on mount and periodically
  const updatePresence = useCallback(async () => {
    if (!profile?.id) {
      logPresence('No profile id, skipping presence update');
      return;
    }

    try {
      logPresence('Updating presence for user:', profile.id);
      const { error } = await supabase
        .from('user_presence')
        .upsert({
          user_id: profile.id,
          is_online: true,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      
      if (error) {
        console.error('[Presence] Failed to update presence:', error.message, error.details);
      } else {
        logPresence('Presence updated successfully');
        // Invalidate presence queries so others see the update
        queryClient.invalidateQueries({ queryKey: ['users-presence'] });
      }
    } catch (error: any) {
      console.error('[Presence] Failed to update presence:', error?.message || error);
    }
  }, [profile?.id, queryClient]);

  // Set offline on unmount
  const setOffline = useCallback(async () => {
    if (!profile?.id) return;

    try {
      logPresence('Setting offline for user:', profile.id);
      const { error } = await supabase
        .from('user_presence')
        .update({
          is_online: false,
          last_seen_at: new Date().toISOString(),
        })
        .eq('user_id', profile.id);
      
      if (error) {
        console.error('[Presence] Failed to set offline:', error.message);
      }
    } catch (error: any) {
      console.error('[Presence] Failed to set offline:', error?.message || error);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;

    logPresence('Initializing presence for user:', profile.id);

    // Set online immediately
    updatePresence();

    // Update presence every 30 seconds
    intervalRef.current = setInterval(updatePresence, 30000);

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        logPresence('App became visible, updating presence');
        updatePresence();
      } else {
        logPresence('App became hidden, setting offline');
        setOffline();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Handle beforeunload - use fetch with keepalive instead of sendBeacon for better reliability
    const handleBeforeUnload = () => {
      logPresence('Window closing, setting offline via keepalive fetch');
      try {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_presence?user_id=eq.${profile.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ is_online: false, last_seen_at: new Date().toISOString() }),
          keepalive: true,
        });
      } catch (e) {
        // Silent fail on unload
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      logPresence('Cleaning up presence');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
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
      if (!userIds.length) {
        logPresence('No user IDs to check for presence');
        return {};
      }

      logPresence('Fetching presence for users:', userIds.length, 'users');

      const { data, error } = await supabase
        .from('user_presence')
        .select('user_id, is_online, last_seen_at')
        .in('user_id', userIds);

      if (error) {
        console.error('[Presence] Failed to fetch user presence:', error.message);
        throw error;
      }

      const now = new Date();
      const statusMap: Record<string, boolean> = {};
      let onlineCount = 0;

      (data || []).forEach((p) => {
        let isOnline = p.is_online;
        if (isOnline) {
          const lastSeen = new Date(p.last_seen_at);
          const diffMs = now.getTime() - lastSeen.getTime();
          // 2 minute threshold
          if (diffMs > 2 * 60 * 1000) {
            isOnline = false;
          }
        }
        statusMap[p.user_id] = isOnline;
        if (isOnline) onlineCount++;
      });

      logPresence('Presence results:', {
        queried: userIds.length,
        found: data?.length || 0,
        online: onlineCount,
      });

      return statusMap;
    },
    enabled: userIds.length > 0,
    staleTime: 10000,
    refetchInterval: 15000, // Check more frequently
  });
}
