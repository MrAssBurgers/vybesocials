import { useEffect, useCallback, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { removeRealtimeChannel, subscribePostgresChannel } from '@/lib/realtimeChannel';

// Global new post signal - listeners can subscribe
type NewPostListener = () => void;
const newPostListeners = new Set<NewPostListener>();

export function onNewPostAvailable(listener: NewPostListener) {
  newPostListeners.add(listener);
  return () => { newPostListeners.delete(listener); };
}

function notifyNewPost() {
  newPostListeners.forEach(fn => fn());
}

/** Shared post query keys — active feeds only (skip saved/local on hot UPDATE path). */
const POST_QUERY_KEYS = [
  ['posts'],
  ['infinite-posts'],
  ['infinite-following-posts'],
  ['following-posts'],
  ['personalized-feed'],
  ['personalized-feed-v2'],
] as const;

const POST_DELETE_KEYS = [
  ...POST_QUERY_KEYS,
  ['social-feed'],
  ['saved-posts'],
  ['local-feed'],
] as const;

/**
 * Subscribes to real-time post changes (INSERT/DELETE/UPDATE).
 * INSERT: notifies listeners so the feed can show a "New posts" banner.
 * DELETE/UPDATE: debounced invalidation to prevent cascade refetching.
 *
 * Public/marketing visitors do not need a global post listener. Waiting for a
 * resolved authenticated session prevents unnecessary Firestore Listen traffic
 * and aborted requests during signed-out startup.
 */
export function usePostsRealtime() {
  const queryClient = useQueryClient();
  const { user, authReady } = useAuth();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced invalidation — coalesces rapid changes into a single refetch
  const invalidatePostCaches = useCallback((deletedId?: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      POST_DELETE_KEYS.forEach(key => queryClient.invalidateQueries({ queryKey: [...key] }));
      if (deletedId) {
        queryClient.invalidateQueries({ queryKey: ['post', deletedId] });
      }
    }, 300);
  }, [queryClient]);

  const patchPostUpdate = useCallback((updated: Record<string, unknown>) => {
    const postId = typeof updated.id === 'string' ? updated.id : null;
    if (!postId) return;
    // Raw updates are not audience receipts. Re-read this feed through its callable.
    void queryClient.invalidateQueries({ queryKey: ['social-feed'] });
    queryClient.setQueryData(['post', postId], (old: unknown) =>
      old && typeof old === 'object' ? { ...(old as object), ...updated } : old,
    );
    const patchList = (old: unknown) => {
      if (!Array.isArray(old)) return old;
      return old.map((row: { id?: string }) =>
        row?.id === postId ? { ...row, ...updated } : row,
      );
    };
    POST_QUERY_KEYS.forEach((key) => {
      queryClient.setQueriesData({ queryKey: [...key] }, patchList);
    });
  }, [queryClient]);

  useEffect(() => {
    if (!authReady || !user?.id) return;

    const channel = subscribePostgresChannel(
      'posts-realtime',
      [
        {
          event: 'INSERT',
          table: 'posts',
          callback: () => { notifyNewPost(); },
        },
        {
          event: 'DELETE',
          table: 'posts',
          callback: (payload) => { invalidatePostCaches(payload.old?.id); },
        },
        {
          event: 'UPDATE',
          table: 'posts',
          callback: (payload) => {
            if (payload.new && typeof payload.new === 'object') {
              patchPostUpdate(payload.new as Record<string, unknown>);
            }
          },
        },
      ],
    );

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      removeRealtimeChannel(channel);
    };
  }, [authReady, user?.id, queryClient, invalidatePostCaches, patchPostUpdate]);
}

/**
 * Hook that tracks whether new posts are available (X-style banner).
 * Returns { hasNewPosts, clearNewPosts }
 */
export function useNewPostsBanner() {
  const [hasNewPosts, setHasNewPosts] = useState(false);
  
  useEffect(() => {
    return onNewPostAvailable(() => setHasNewPosts(true));
  }, []);
  
  const clearNewPosts = useCallback(() => setHasNewPosts(false), []);
  
  return { hasNewPosts, clearNewPosts };
}
