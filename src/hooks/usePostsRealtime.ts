import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribes to real-time post changes (DELETE/UPDATE).
 * When a post is deleted by a mod or user, all post queries are invalidated instantly.
 */
export function usePostsRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('posts-realtime')
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
