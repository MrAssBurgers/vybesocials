import { useEffect, useCallback, useState } from 'react';
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

/**
 * Subscribes to real-time post changes (INSERT/DELETE/UPDATE).
 * INSERT: notifies listeners so the feed can show a "New posts" banner.
 * DELETE/UPDATE: invalidates caches instantly so removals are real-time.
 */
export function usePostsRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('posts-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        () => {
          // Don't auto-inject - notify so UI can show "New posts available"
          notifyNewPost();
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'posts' },
        (payload) => {
          const deletedId = payload.old?.id;
          
          // Remove from all post caches immediately
          queryClient.invalidateQueries({ queryKey: ['posts'] });
          queryClient.invalidateQueries({ queryKey: ['infinite-posts'] });
          queryClient.invalidateQueries({ queryKey: ['infinite-following-posts'] });
          queryClient.invalidateQueries({ queryKey: ['following-posts'] });
          queryClient.invalidateQueries({ queryKey: ['saved-posts'] });
          queryClient.invalidateQueries({ queryKey: ['personalized-feed'] });
          
          if (deletedId) {
            queryClient.invalidateQueries({ queryKey: ['post', deletedId] });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'posts' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['posts'] });
          queryClient.invalidateQueries({ queryKey: ['infinite-posts'] });
          queryClient.invalidateQueries({ queryKey: ['infinite-following-posts'] });
          queryClient.invalidateQueries({ queryKey: ['personalized-feed'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
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
