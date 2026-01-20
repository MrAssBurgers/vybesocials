import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PreloadStatus {
  step: string;
  progress: number;
  isComplete: boolean;
}

// Streamlined preload steps - reduced for faster startup
const PRELOAD_STEPS = [
  { key: 'init', label: 'Starting...', weight: 10 },
  { key: 'auth', label: 'Authenticating...', weight: 15 },
  { key: 'profile', label: 'Loading profile...', weight: 20 },
  { key: 'data', label: 'Loading content...', weight: 45 },
  { key: 'ready', label: 'Ready!', weight: 10 },
];

// Preload an image and return a promise
const preloadImage = (url: string): Promise<void> => {
  return new Promise((resolve) => {
    if (!url) {
      resolve();
      return;
    }
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve(); // Don't fail on image errors
    img.src = url;
  });
};

// Preload video metadata
const preloadVideoMetadata = (url: string): Promise<void> => {
  return new Promise((resolve) => {
    if (!url) {
      resolve();
      return;
    }
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => resolve();
    video.onerror = () => resolve();
    video.src = url;
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
      progress: Math.min(Math.round(progressBefore + stepProgress), 100),
      isComplete: stepKey === 'ready',
    });
  }, []);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const preload = async () => {
      try {
        // Step 1: Initialize
        updateStatus('init');

        // Step 2: Check authentication
        updateStatus('auth');
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          // Not logged in - minimal load, done instantly
          updateStatus('ready');
          return;
        }

        const uid = session.user.id;

        // Step 3: Load profile
        updateStatus('profile');
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, display_name, bio, is_verified')
          .eq('id', uid)
          .maybeSingle();

        if (profile) {
          queryClient.setQueryData(['profile', uid], profile);
        }

        // Step 4: Load critical data in parallel for speed
        updateStatus('data');
        
        const [conversationsResult, postsResult, notificationsResult] = await Promise.allSettled([
          // Conversations - limit to 30 for faster load
          supabase
            .from('conversation_members')
            .select(`
              conversation:conversations!inner(id, name, is_group, avatar_url, updated_at),
              is_muted, is_pinned, last_read_at
            `)
            .eq('user_id', uid)
            .order('conversation(updated_at)', { ascending: false })
            .limit(30),
          
          // Posts - limit to 50 for faster load
          supabase.rpc('get_posts_with_counts', {
            p_type: null,
            p_author_id: null,
            p_user_id: uid,
            p_offset: 0,
            p_limit: 50,
          }),
          
          // Notifications - limit to 20
          supabase
            .from('notifications')
            .select(`id, type, read, created_at, post_id, actor:profiles!notifications_actor_id_fkey(id, username, avatar_url)`)
            .eq('user_id', uid)
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        // Process conversations
        if (conversationsResult.status === 'fulfilled' && conversationsResult.value.data) {
          queryClient.setQueryData(['conversations', uid], conversationsResult.value.data);
        }

        // Process posts
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
            {
              pages: [{ posts: transformedPosts, nextPage: transformedPosts.length >= 50 ? 1 : null, totalLoaded: transformedPosts.length }],
              pageParams: [0],
            }
          );
        }

        // Process notifications
        if (notificationsResult.status === 'fulfilled' && notificationsResult.value.data) {
          queryClient.setQueryData(['notifications', uid], notificationsResult.value.data);
        }

        // Done - skip media preloading during initial load for faster startup
        updateStatus('ready');

      } catch (error) {
        console.error('[Preloader] Error:', error);
        setStatus({ step: 'Ready!', progress: 100, isComplete: true });
      }
    };

    preload();
  }, [queryClient, updateStatus]);

  return status;
}