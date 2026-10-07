import { useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { collectionRef, onSnapshot, query, where } from '@/lib/firebase/firestoreDb';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { isPermissionDeniedError, warnOnce } from '@/lib/logOnce';
import { presenceHeartbeatMs } from '@/lib/nativePerfMode';
import {
  chunkIds,
  presenceIdsKey,
  presenceIsOnline,
  shouldMirrorLastActive,
} from '@/lib/signedInListenScope';

// Debug flag - set to true for dev debugging
const DEBUG_PRESENCE = false;

function logPresence(...args: any[]) {
  if (DEBUG_PRESENCE) {
    console.log('[Presence]', ...args);
  }
}

let lastActiveMirroredAt = 0;

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
      const { error } = await db
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
        if (isPermissionDeniedError(error)) {
          warnOnce('presence-update-denied', '[Presence] Failed to update presence:', error.message);
          return;
        }

        console.error('[Presence] Failed to update presence:', error.message, error.details);
      } else {
        logPresence('Presence updated successfully');
        const mirroredAt = Date.now();
        if (shouldMirrorLastActive(mirroredAt, lastActiveMirroredAt)) {
          lastActiveMirroredAt = mirroredAt;
          void db
            .from('profiles')
            .update({ last_active_at: new Date(mirroredAt).toISOString() })
            .eq('id', profile.id)
            .then(({ error: profileErr }) => {
              if (profileErr && import.meta.env.DEV) {
                console.warn('[Presence] profile last_active_at:', profileErr.message);
              }
            });
        }
      }
    } catch (error: any) {
      if (isTransientPresenceError(error)) {
        logPresence('Transient presence update failure:', error?.message || error);
        return;
      }
      if (isPermissionDeniedError(error)) {
        warnOnce('presence-update-denied', '[Presence] Failed to update presence:', error?.message || error);
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
      const { error } = await db
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

    // Update presence on a calm interval — realtime patches keep DM indicators fresh.
    intervalRef.current = setInterval(updatePresence, presenceHeartbeatMs());

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
      if (e.persisted) return;
      void setOffline();
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

      const { data, error } = await db
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
    staleTime: 5000,
    // Global realtime presence listener keeps cache fresh — no polling needed.
    refetchInterval: false,
  });

  // Subscribe to realtime updates
  useEffect(() => {
    if (!userId) return;

    const channel = subscribePostgresChannel(`presence:${userId}`, [
      {
        event: '*',
        table: 'user_presence',
        filter: `user_id=eq.${userId}`,
        callback: (payload) => {
          const next = (payload as any).new;
          if (next) {
            let isOnline = Boolean(next.is_online);
            if (isOnline && next.last_seen_at) {
              const diffMs = Date.now() - new Date(next.last_seen_at).getTime();
              if (diffMs > 90 * 1000) isOnline = false;
            }
            queryClient.setQueryData(['user-presence', userId], {
              is_online: isOnline,
              last_seen_at: next.last_seen_at,
            });
          } else {
            queryClient.invalidateQueries({ queryKey: ['user-presence', userId] });
          }
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [userId, queryClient]);

  return query;
}

function applyPresenceSnapshot(
  queryClient: ReturnType<typeof useQueryClient>,
  idsKey: string,
  snap: { docChanges: () => Iterable<{ type: string; doc: { data: () => Record<string, unknown> } }> },
) {
  const patches: { userId: string; removed: boolean; online: boolean; lastSeenAt: string | null }[] = [];
  for (const change of snap.docChanges()) {
    const data = change.doc.data();
    const userId = typeof data.user_id === 'string' ? data.user_id : '';
    if (!userId) continue;
    if (change.type === 'removed') {
      patches.push({ userId, removed: true, online: false, lastSeenAt: null });
      continue;
    }
    const lastSeenAt = typeof data.last_seen_at === 'string' ? data.last_seen_at : null;
    patches.push({
      userId,
      removed: false,
      online: presenceIsOnline(data.is_online, lastSeenAt),
      lastSeenAt,
    });
  }
  if (!patches.length) return;
  queryClient.setQueryData<Record<string, boolean>>(['users-presence', idsKey], (old) => {
    const next = { ...(old ?? {}) };
    let changed = !old;
    for (const patch of patches) {
      if (patch.removed) {
        if (patch.userId in next) {
          delete next[patch.userId];
          changed = true;
        }
        continue;
      }
      if (next[patch.userId] !== patch.online) {
        next[patch.userId] = patch.online;
        changed = true;
      }
    }
    return changed ? next : old;
  });
  for (const patch of patches) {
    if (patch.removed) continue;
    queryClient.setQueryData(['user-presence', patch.userId], {
      is_online: patch.online,
      last_seen_at: patch.lastSeenAt,
    });
  }
}

// Hook to get multiple users' online status
export function useUsersOnlineStatus(userIds: string[]) {
  const queryClient = useQueryClient();
  const idsKey = presenceIdsKey(userIds);

  useEffect(() => {
    if (!idsKey) return;
    const ids = idsKey.split(',');
    const unsubs = chunkIds(ids).map((chunk) => onSnapshot(
      query(collectionRef('user_presence'), where('user_id', 'in', chunk)),
      (snap) => applyPresenceSnapshot(queryClient, idsKey, snap),
      (error) => {
        if (isPermissionDeniedError(error)) return;
        warnOnce('users-presence-listen', '[Presence] Scoped presence listener failed:', error.message);
      },
    ));
    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [idsKey, queryClient]);

  return useQuery({
    queryKey: ['users-presence', idsKey],
    queryFn: async () => {
      const userIds = idsKey ? idsKey.split(',') : [];
      if (!userIds.length) {
        logPresence('No user IDs to check for presence');
        return {};
      }

      logPresence('Fetching presence for users:', userIds.length, 'users');

      const { data, error } = await db
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
    enabled: idsKey.length > 0,
    staleTime: 30_000,
    refetchInterval: false,
  });
}
