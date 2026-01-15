import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PreloadStatus {
  step: string;
  progress: number;
  isComplete: boolean;
}

const PRELOAD_STEPS = [
  { key: 'init', label: 'Initializing...', weight: 5 },
  { key: 'auth', label: 'Checking authentication...', weight: 10 },
  { key: 'profile', label: 'Loading profile...', weight: 10 },
  { key: 'posts', label: 'Loading feed...', weight: 20 },
  { key: 'stories', label: 'Loading stories...', weight: 10 },
  { key: 'conversations', label: 'Loading messages...', weight: 15 },
  { key: 'notifications', label: 'Checking notifications...', weight: 10 },
  { key: 'images', label: 'Preloading media...', weight: 15 },
  { key: 'ready', label: 'Ready!', weight: 5 },
];

// Preload a single image and return a promise
const preloadImage = (url: string): Promise<void> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve(); // Don't fail on image errors
    img.src = url;
    // Timeout after 3 seconds per image
    setTimeout(resolve, 3000);
  });
};

export function useAppPreloader() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PreloadStatus>({
    step: 'Initializing...',
    progress: 0,
    isComplete: false,
  });
  const hasStarted = useRef(false);

  const updateStatus = useCallback((stepKey: string, partialProgress?: number) => {
    const stepIndex = PRELOAD_STEPS.findIndex(s => s.key === stepKey);
    if (stepIndex === -1) return;

    const step = PRELOAD_STEPS[stepIndex];
    const progressBefore = PRELOAD_STEPS.slice(0, stepIndex).reduce((acc, s) => acc + s.weight, 0);
    const stepProgress = partialProgress !== undefined ? (step.weight * partialProgress) : step.weight;
    
    setStatus({
      step: step.label,
      progress: Math.min(progressBefore + stepProgress, 100),
      isComplete: stepKey === 'ready',
    });
  }, []);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const preload = async () => {
      const imagesToPreload: string[] = [];

      try {
        // Step 1: Initialize
        updateStatus('init');
        await new Promise(r => setTimeout(r, 100));

        // Step 2: Check authentication
        updateStatus('auth');
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          // Not logged in - complete quickly with minimal preloading
          updateStatus('ready');
          return;
        }

        const uid = session.user.id;

        // Step 3: Load profile
        updateStatus('profile');
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, display_name')
          .eq('id', uid)
          .single();

        if (profile) {
          queryClient.setQueryData(['profile', uid], profile);
          if (profile.avatar_url) {
            imagesToPreload.push(profile.avatar_url);
          }
        }

        // Step 4: Prefetch posts
        updateStatus('posts');
        const { data: posts } = await supabase.rpc('get_posts_with_counts', {
          p_type: null,
          p_author_id: null,
          p_user_id: uid,
          p_offset: 0,
          p_limit: 15,
        });

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

          // Collect images to preload
          transformedPosts.slice(0, 8).forEach((post: any) => {
            const url = post.thumbnail_url || post.media_url;
            if (url && !url.includes('.mp4') && !url.includes('.webm')) {
              imagesToPreload.push(url);
            }
            if (post.author?.avatar_url) {
              imagesToPreload.push(post.author.avatar_url);
            }
          });

          // Cache in query client
          queryClient.setQueryData(
            ['infinite-posts', undefined, undefined, uid],
            {
              pages: [{ posts: transformedPosts, nextPage: transformedPosts.length >= 15 ? 1 : null }],
              pageParams: [0],
            }
          );
        }

        // Step 5: Load stories
        updateStatus('stories');
        const { data: stories } = await supabase
          .from('stories')
          .select(`
            id,
            media_url,
            created_at,
            user_id,
            profiles:user_id (
              id,
              username,
              avatar_url
            )
          `)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(20);

        if (stories && stories.length > 0) {
          queryClient.setQueryData(['stories'], stories);
          // Collect story images
          stories.slice(0, 10).forEach((story: any) => {
            if (story.media_url && !story.media_url.includes('.mp4')) {
              imagesToPreload.push(story.media_url);
            }
            if (story.profiles?.avatar_url) {
              imagesToPreload.push(story.profiles.avatar_url);
            }
          });
        }

        // Step 6: Load conversations
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
          .limit(15);

        if (conversations) {
          queryClient.setQueryData(['conversations', uid], conversations);
          // Collect conversation avatars
          conversations.forEach((conv: any) => {
            if (conv.conversations?.avatar_url) {
              imagesToPreload.push(conv.conversations.avatar_url);
            }
          });
        }

        // Step 7: Check notifications count
        updateStatus('notifications');
        const { count } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid)
          .eq('read', false);

        if (count !== null) {
          queryClient.setQueryData(['unread-notifications', uid], count);
        }

        // Step 8: Preload all collected images
        updateStatus('images', 0);
        const uniqueImages = [...new Set(imagesToPreload)].slice(0, 20);
        
        if (uniqueImages.length > 0) {
          let loaded = 0;
          await Promise.all(
            uniqueImages.map(async (url) => {
              await preloadImage(url);
              loaded++;
              updateStatus('images', loaded / uniqueImages.length);
            })
          );
        }

        // Step 9: Complete!
        updateStatus('ready');

      } catch (error) {
        console.error('[Preloader] Error during preload:', error);
        // Still complete even on error
        setStatus({ step: 'Ready!', progress: 100, isComplete: true });
      }
    };

    preload();
  }, [queryClient, updateStatus]);

  return status;
}
