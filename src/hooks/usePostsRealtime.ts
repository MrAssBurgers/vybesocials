import { useEffect, useCallback, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

/** Shared post query keys — avoids duplicating the list everywhere */
const POST_QUERY_KEYS = [
  ['posts'],
  ['infinite-posts'],
  ['infinite-following-posts'],
  ['following-posts'],
  ['saved-posts'],
  ['personalized-feed'],
  ['personalized-feed-v2'],
  ['local-feed'],
] as const;

/**
 * Subscribes to real-time post changes (INSERT/DELETE/UPDATE).
 * INSERT: notifies listeners so the feed can show a "New posts" banner.
 * DELETE/UPDATE: debounced invalidation to prevent cascade refetching.
 */
export function usePostsRealtime() {
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced invalidation — coalesces rapid changes into a single refetch
  const invalidatePostCaches = useCallback((deletedId?: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      POST_QUERY_KEYS.forEach(key => queryClient.invalidateQueries({ queryKey: [...key] }));
      if (deletedId) {
        queryClient.invalidateQueries({ queryKey: ['post', deletedId] });
      }
    }, 300);
  }, [queryClient]);

  useEffect(() => {
    const channel = supabase
      .channel('posts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        () => { notifyNewPost(); }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'posts' },
        (payload) => { invalidatePostCaches(payload.old?.id); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'posts' },
        () => { invalidatePostCaches(); }
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [queryClient, invalidatePostCaches]);
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
