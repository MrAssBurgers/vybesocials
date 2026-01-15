import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PreloadStatus {
  step: string;
  progress: number;
  isComplete: boolean;
}

export function useAppPreloader() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PreloadStatus>({
    step: 'Loading...',
    progress: 0,
    isComplete: false,
  });
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const preload = async () => {
      try {
        setStatus({ step: 'Connecting...', progress: 10, isComplete: false });

        // Quick auth check
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          // Not logged in - done immediately
          setStatus({ step: 'Ready!', progress: 100, isComplete: true });
          return;
        }

        const uid = session.user.id;
        setStatus({ step: 'Loading your content...', progress: 30, isComplete: false });

        // Run ALL fetches in parallel for maximum speed
        const [profileResult, conversationsResult, postsResult, notificationsResult] = await Promise.allSettled([
          // Profile
          supabase
            .from('profiles')
            .select('id, username, avatar_url, display_name, bio, is_verified')
            .eq('id', uid)
            .maybeSingle(),
          
          // Conversations
          supabase
            .from('conversation_members')
            .select(`
              conversation:conversations!inner(id, name, is_group, avatar_url, updated_at),
              is_muted, is_pinned, last_read_at
            `)
            .eq('user_id', uid)
            .order('conversation(updated_at)', { ascending: false })
            .limit(30),
          
          // Posts
          supabase.rpc('get_posts_with_counts', {
            p_type: null,
            p_author_id: null,
            p_user_id: uid,
            p_offset: 0,
            p_limit: 15,
          }),
          
          // Notifications
          supabase
            .from('notifications')
            .select(`id, type, read, created_at, post_id, actor:profiles!notifications_actor_id_fkey(id, username, avatar_url)`)
            .eq('user_id', uid)
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        setStatus({ step: 'Preparing...', progress: 70, isComplete: false });

        // Cache results (non-blocking)
        if (profileResult.status === 'fulfilled' && profileResult.value.data) {
          queryClient.setQueryData(['profile', uid], profileResult.value.data);
        }

        if (conversationsResult.status === 'fulfilled' && conversationsResult.value.data) {
          queryClient.setQueryData(['conversations', uid], conversationsResult.value.data);
        }

        if (postsResult.status === 'fulfilled' && postsResult.value.data) {
          const posts = postsResult.value.data;
          const transformedPosts = posts.map((row: any) => ({
            id: row.id,
            type: row.type,
            media_url: row.media_url,
            thumbnail_url: row.thumbnail_url,
            caption: row.caption || '',
            tags: row.tags || [],
            created_at: row.created_at,
            is_pinned: row.is_pinned,
            author: {
              id: row.author_id,
              username: row.author_username,
              avatar_url: row.author_avatar_url,
            },
            like_count: Number(row.like_count) || 0,
            comment_count: Number(row.comment_count) || 0,
            is_liked: row.is_liked || false,
            is_bookmarked: row.is_bookmarked || false,
          }));
          queryClient.setQueryData(
            ['infinite-posts', undefined, undefined, uid],
            { pages: [{ posts: transformedPosts, nextPage: transformedPosts.length >= 15 ? 1 : null }], pageParams: [0] }
          );
        }

        if (notificationsResult.status === 'fulfilled' && notificationsResult.value.data) {
          queryClient.setQueryData(['notifications', uid], notificationsResult.value.data);
        }

        setStatus({ step: 'Ready!', progress: 100, isComplete: true });

      } catch (error) {
        console.error('[Preloader] Error:', error);
        setStatus({ step: 'Ready!', progress: 100, isComplete: true });
      }
    };

    preload();
  }, [queryClient]);

  return status;
}
