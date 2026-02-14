import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { preloadCriticalRoutes, preloadSecondaryRoutes } from '@/lib/routePreloader';

interface PreloadStatus {
  step: string;
  progress: number;
  isComplete: boolean;
}

/**
 * Minimal preloader - renders the app IMMEDIATELY.
 * All data loading happens in the background after mount.
 * No more blocking splash screen.
 */
export function useAppPreloader() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PreloadStatus>({
    step: 'Initializing...',
    progress: 0,
    isComplete: false,
  });
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    // Background data prefetch - splash shows while loading
    const prefetchInBackground = async () => {
      try {
        setStatus({ step: 'Connecting...', progress: 15, isComplete: false });

        let session = null;
        try {
          const authResult = await supabase.auth.getSession();
          session = authResult.data.session;
        } catch {
          // Auth failed, continue as guest
        }

        setStatus({ step: 'Loading your feed...', progress: 40, isComplete: false });

        if (!session?.user) {
          // Guest - prefetch feed in background
          try {
            const { data } = await supabase.rpc('get_posts_with_counts', {
              p_type: 'feed_post',
              p_author_id: null,
              p_user_id: null,
              p_offset: 0,
              p_limit: 30,
            });
            if (data) cacheFeedData(queryClient, data as any[], null, 'feed_post');
          } catch {}
          setStatus({ step: 'Ready!', progress: 100, isComplete: true });
          return;
        }

        const uid = session.user.id;

        // Get profile first (fast)
        setStatus({ step: 'Loading profile...', progress: 50, isComplete: false });
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', uid)
          .maybeSingle();

        const profileId = profileData?.id;
        if (profileData) {
          queryClient.setQueryData(['profile', profileId], profileData);
        }

        if (!profileId) {
          setStatus({ step: 'Ready!', progress: 100, isComplete: true });
          return;
        }

        setStatus({ step: 'Loading content...', progress: 70, isComplete: false });

        // Fire all background fetches in parallel - none of these block the UI
        Promise.allSettled([
          // Feed
          supabase.rpc('get_posts_with_counts', {
            p_type: null,
            p_author_id: null,
            p_user_id: profileId,
            p_offset: 0,
            p_limit: 25,
          }).then(({ data }) => {
            if (data) cacheFeedData(queryClient, data as any[], profileId, null);
          }),

          // Clips
          supabase.rpc('get_posts_with_counts', {
            p_type: 'short',
            p_author_id: null,
            p_user_id: profileId,
            p_offset: 0,
            p_limit: 15,
          }).then(({ data }) => {
            if (data) cacheFeedData(queryClient, data as any[], profileId, 'short');
          }),

          // Notifications
          supabase
            .from('notifications')
            .select(`*, actor:profiles!notifications_actor_id_fkey(id, username, avatar_url)`)
            .eq('user_id', profileId)
            .order('created_at', { ascending: false })
            .limit(15)
            .then(({ data }) => {
              if (data) queryClient.setQueryData(['notifications', profileId], data);
            }),

          // Conversations (simplified - let the Messages page handle full loading)
          supabase
            .from('conversation_members')
            .select('conversation_id, last_read_at, is_pinned, is_muted')
            .eq('user_id', profileId)
            .then(async ({ data: membershipData }) => {
              if (!membershipData?.length) return;
              const convIds = membershipData.map(m => m.conversation_id);
              const { data: convs } = await supabase
                .from('conversations')
                .select(`*, members:conversation_members(user_id, role, is_muted, is_pinned, last_read_at, profile:profiles(id, username, avatar_url, display_name))`)
                .in('id', convIds)
                .order('updated_at', { ascending: false })
                .limit(20);
              if (convs) {
                queryClient.setQueryData(['dm-conversations', profileId], convs);
                queryClient.setQueryData(['conversations', profileId], convs);
              }
            }),
        ]).catch(() => {});

        setStatus({ step: 'Ready!', progress: 100, isComplete: true });

        // Route preloading
        preloadCriticalRoutes();
        setTimeout(() => preloadSecondaryRoutes(), 3000);

      } catch (error) {
        console.warn('[Prefetch] Background error:', error);
        // Always complete even on error - never leave user stuck
        setStatus({ step: 'Ready!', progress: 100, isComplete: true });
      }
    };

    // Start immediately
    prefetchInBackground();

    // Safety timeout - never stay on splash more than 4 seconds
    const safetyTimer = setTimeout(() => {
      setStatus(prev => prev.isComplete ? prev : { step: 'Ready!', progress: 100, isComplete: true });
    }, 4000);

    return () => clearTimeout(safetyTimer);
  }, [queryClient]);

  return status;
}

// Helper function to cache feed data in the correct format
function cacheFeedData(
  queryClient: ReturnType<typeof useQueryClient>,
  posts: any[],
  userId: string | null,
  type: string | null
) {
  const transformedPosts = posts.map((row) => ({
    id: row.id,
    type: row.type,
    media_url: row.media_url,
    thumbnail_url: row.thumbnail_url,
    caption: row.caption || '',
    tags: row.tags || [],
    created_at: row.created_at,
    is_pinned: row.is_pinned,
    view_count: row.view_count || 0,
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
    ['infinite-posts', type, undefined, userId],
    {
      pages: [{ 
        posts: transformedPosts, 
        nextPage: transformedPosts.length >= 20 ? 1 : null, 
        totalLoaded: transformedPosts.length 
      }],
      pageParams: [0],
    }
  );

  if (type === 'feed_post' || type === null) {
    queryClient.setQueryData(
      ['infinite-posts', undefined, undefined, userId],
      {
        pages: [{ 
          posts: transformedPosts, 
          nextPage: transformedPosts.length >= 30 ? 1 : null, 
          totalLoaded: transformedPosts.length 
        }],
        pageParams: [0],
      }
    );
  }
}