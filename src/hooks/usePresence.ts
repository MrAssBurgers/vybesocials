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

function isTransientPresenceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /failed to fetch|networkerror|load failed|abort/i.test(message);
}

export function usePresence() {
  const { profile } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update presence on mount and periodically
  const updatePresence = useCallback(async () => {
    if (!profile?.id) {
      logPresence('No profile id, skipping presence update');
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      logPresence('Browser is offline, skipping presence update');
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
        if (isTransientPresenceError(error)) {
          logPresence('Transient presence update failure:', error.message);
          return;
        }

        console.error('[Presence] Failed to update presence:', error.message, error.details);
      } else {
        logPresence('Presence updated successfully');
      }
    } catch (error: any) {
      if (isTransientPresenceError(error)) {
        logPresence('Transient presence update failure:', error?.message || error);
        return;
      }

      console.error('[Presence] Failed to update presence:', error?.message || error);
    }
  }, [profile?.id]);

  // Set offline on unmount
  const setOffline = useCallback(async () => {
    if (!profile?.id) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      logPresence('Browser is offline, skipping setOffline');
      return;
    }

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
        if (isTransientPresenceError(error)) {
          logPresence('Transient presence offline failure:', error.message);
          return;
        }

        console.error('[Presence] Failed to set offline:', error.message);
      }
    } catch (error: any) {
      if (isTransientPresenceError(error)) {
        logPresence('Transient presence offline failure:', error?.message || error);
        return;
      }

      console.error('[Presence] Failed to set offline:', error?.message || error);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;

    logPresence('Initializing presence for user:', profile.id);

    // Update presence immediately on mount for instant online status
    updatePresence();

    // Update presence every 20 seconds for faster online indicators
    intervalRef.current = setInterval(updatePresence, 20000);

    // Visibility: only re-ping presence on visible. We intentionally do NOT
    // flip to offline on hidden — mobile tab-switching, briefly backgrounding
    // the app, or React StrictMode remounts otherwise cause an online/offline
    // flap that cascades into DM list refetch storms and visible flicker.
    let visibilityTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleVisibilityChange = () => {
      if (visibilityTimeout) clearTimeout(visibilityTimeout);
      visibilityTimeout = setTimeout(() => {
        if (document.visibilityState === 'visible') {
          logPresence('App became visible, updating presence');
          updatePresence();
        }
      }, 300);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Only mark offline on true page unload (real tab close / hard navigation).
    // Use pagehide which fires reliably on mobile Safari and modern browsers.
    const handlePageHide = (e: PageTransitionEvent) => {
      // bfcache navigations should NOT mark offline — the session stays alive.
      if (e.persisted) return;
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

    window.addEventListener('pagehide', handlePageHide);

    return () => {
      logPresence('Cleaning up presence');
      if (visibilityTimeout) clearTimeout(visibilityTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      // NOTE: do NOT call setOffline() here. The presence hook lives at
      // AppLayout level and unmounts on every route change / StrictMode pass.
      // Marking offline on unmount caused presence to flap and triggered
      // DM cache invalidations, which is the root cause of the flicker.
    };
  }, [profile?.id, updatePresence]);

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

      // Consider user offline if last seen more than 90 seconds ago (more responsive)
      if (data?.is_online) {
        const lastSeen = new Date(data.last_seen_at);
        const now = new Date();
        const diffMs = now.getTime() - lastSeen.getTime();
        if (diffMs > 90 * 1000) {
          return { is_online: false, last_seen_at: data.last_seen_at };
        }
      }

      return data;
    },
    enabled: !!userId,
    staleTime: 5000, // 5 seconds stale time for live sync
    refetchInterval: 10000, // 10 seconds refetch interval for responsive updates
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
        (payload) => {
          // Patch cache directly — avoid forced refetch storms on every event.
          const next = (payload as any).new;
          if (next) {
            queryClient.setQueryData(['user-presence', userId], {
              is_online: next.is_online,
              last_seen_at: next.last_seen_at,
            });
          } else {
            queryClient.invalidateQueries({ queryKey: ['user-presence', userId] });
          }
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
          // 90 second threshold for faster online/offline detection
          if (diffMs > 90 * 1000) {
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
    // Realtime patches via useGlobalRealtimeMessages presence channel keep this
    // cache fresh — no polling needed.
    refetchInterval: false,
  });
}
