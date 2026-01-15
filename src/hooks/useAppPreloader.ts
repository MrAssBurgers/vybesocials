import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PreloadStatus {
  step: string;
  progress: number;
  isComplete: boolean;
}

const PRELOAD_STEPS = [
  { key: 'auth', label: 'Checking authentication...', weight: 15 },
  { key: 'profile', label: 'Loading profile...', weight: 15 },
  { key: 'posts', label: 'Loading feed...', weight: 30 },
  { key: 'conversations', label: 'Loading messages...', weight: 20 },
  { key: 'notifications', label: 'Checking notifications...', weight: 10 },
  { key: 'ready', label: 'Ready!', weight: 10 },
];

export function useAppPreloader() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PreloadStatus>({
    step: 'Initializing...',
    progress: 0,
    isComplete: false,
  });
  const [userId, setUserId] = useState<string | null>(null);

  const updateStatus = useCallback((stepKey: string) => {
    const stepIndex = PRELOAD_STEPS.findIndex(s => s.key === stepKey);
    if (stepIndex === -1) return;

    const step = PRELOAD_STEPS[stepIndex];
    const progressBefore = PRELOAD_STEPS.slice(0, stepIndex).reduce((acc, s) => acc + s.weight, 0);
    
    setStatus({
      step: step.label,
      progress: progressBefore + step.weight,
      isComplete: stepKey === 'ready',
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const preload = async () => {
      try {
        // Step 1: Check authentication
        updateStatus('auth');
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (!session?.user) {
          // Not logged in - complete quickly
          setStatus({ step: 'Ready!', progress: 100, isComplete: true });
          return;
        }

        const uid = session.user.id;
        setUserId(uid);

        // Step 2: Load profile
        updateStatus('profile');
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, display_name, role')
          .eq('id', uid)
          .single();
        
        if (!isMounted) return;

        if (profile) {
          queryClient.setQueryData(['profile', uid], profile);
        }

        // Step 3: Prefetch posts
        updateStatus('posts');
        const { data: posts } = await supabase.rpc('get_posts_with_counts', {
          p_type: null,
          p_author_id: null,
          p_user_id: uid,
          p_offset: 0,
          p_limit: 10,
        });

        if (!isMounted) return;

        if (posts && posts.length > 0) {
          // Transform and cache posts
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

          // Preload images
          transformedPosts.slice(0, 6).forEach((post: any) => {
            const url = post.thumbnail_url || post.media_url;
            if (url) {
              const link = document.createElement('link');
              link.rel = 'preload';
              link.as = 'image';
              link.href = url;
              document.head.appendChild(link);
            }
          });

          // Cache in query client
          queryClient.setQueryData(
            ['infinite-posts', undefined, undefined, uid],
            {
              pages: [{ posts: transformedPosts, nextPage: transformedPosts.length >= 10 ? 1 : null }],
              pageParams: [0],
            }
          );
        }

        // Step 4: Load conversations
        updateStatus('conversations');
        const { data: conversations } = await supabase
          .from('conversation_members')
          .select(`
            conversation_id,
            conversations!inner (
              id,
              name,
              is_group,
              avatar_url,
              updated_at
            )
          `)
          .eq('user_id', uid)
          .order('joined_at', { ascending: false })
          .limit(10);

        if (!isMounted) return;

        if (conversations) {
          queryClient.setQueryData(['conversations', uid], conversations);
        }

        // Step 5: Check notifications count
        updateStatus('notifications');
        const { count } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid)
          .eq('read', false);

        if (!isMounted) return;

        if (count !== null) {
          queryClient.setQueryData(['unread-notifications', uid], count);
        }

        // Step 6: Complete!
        updateStatus('ready');

      } catch (error) {
        console.error('[Preloader] Error during preload:', error);
        // Still complete even on error
        if (isMounted) {
          setStatus({ step: 'Ready!', progress: 100, isComplete: true });
        }
      }
    };

    preload();

    return () => {
      isMounted = false;
    };
  }, [queryClient, updateStatus]);

  return status;
}
