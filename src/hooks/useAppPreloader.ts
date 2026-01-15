import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PreloadStatus {
  step: string;
  progress: number;
  isComplete: boolean;
}

// Comprehensive preload steps for full content caching
const PRELOAD_STEPS = [
  { key: 'init', label: 'Initializing...', weight: 5 },
  { key: 'auth', label: 'Checking authentication...', weight: 10 },
  { key: 'profile', label: 'Loading profile...', weight: 10 },
  { key: 'conversations', label: 'Loading conversations...', weight: 15 },
  { key: 'posts', label: 'Loading feed...', weight: 15 },
  { key: 'notifications', label: 'Loading notifications...', weight: 10 },
  { key: 'stories', label: 'Loading stories...', weight: 10 },
  { key: 'friends', label: 'Loading friends...', weight: 10 },
  { key: 'media', label: 'Preloading media...', weight: 10 },
  { key: 'ready', label: 'Ready!', weight: 5 },
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
        await new Promise(r => setTimeout(r, 50));

        // Step 2: Check authentication
        updateStatus('auth');
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          // Not logged in - minimal load
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
          // Preload avatar
          if (profile.avatar_url) {
            preloadImage(profile.avatar_url);
          }
        }

        // Step 4: Load conversations with participants
        updateStatus('conversations');
        const { data: conversations } = await supabase
          .from('conversation_members')
          .select(`
            conversation:conversations!inner(
              id,
              name,
              is_group,
              avatar_url,
              updated_at,
              created_by
            ),
            is_muted,
            is_pinned,
            last_read_at
          `)
          .eq('user_id', uid)
          .order('conversation(updated_at)', { ascending: false })
          .limit(50);

        if (conversations && conversations.length > 0) {
          queryClient.setQueryData(['conversations', uid], conversations);
          
          // Preload conversation avatars
          const avatarUrls = conversations
            .map((c: any) => c.conversation?.avatar_url)
            .filter(Boolean)
            .slice(0, 20);
          await Promise.all(avatarUrls.map(preloadImage));
        }

        // Step 5: Load feed posts - load ALL posts for instant experience
        updateStatus('posts');
        const { data: posts } = await supabase.rpc('get_posts_with_counts', {
          p_type: null,
          p_author_id: null,
          p_user_id: uid,
          p_offset: 0,
          p_limit: 100, // Load 100 posts for instant experience
        });

        if (posts && posts.length > 0) {
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
              pages: [{ posts: transformedPosts, nextPage: transformedPosts.length >= 100 ? 1 : null, totalLoaded: transformedPosts.length }],
              pageParams: [0],
            }
          );

          // Preload post media (first 20 thumbnails immediately)
          const mediaToPreload = transformedPosts
            .slice(0, 20)
            .flatMap((post: any) => [post.thumbnail_url, post.author?.avatar_url])
            .filter(Boolean);
          mediaToPreload.forEach((url: string) => {
            const img = new Image();
            img.src = url;
          });
        }

        // Step 6: Load notifications
        updateStatus('notifications');
        const { data: notifications } = await supabase
          .from('notifications')
          .select(`
            id,
            type,
            read,
            created_at,
            post_id,
            actor:profiles!notifications_actor_id_fkey(id, username, avatar_url)
          `)
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(30);

        if (notifications) {
          queryClient.setQueryData(['notifications', uid], notifications);
          
          // Preload notification actor avatars
          const actorAvatars = notifications
            .map((n: any) => n.actor?.avatar_url)
            .filter(Boolean)
            .slice(0, 10);
          await Promise.all(actorAvatars.map(preloadImage));
        }

        // Step 7: Load stories
        updateStatus('stories');
        const { data: stories } = await supabase
          .from('stories')
          .select(`
            id,
            media_url,
            media_type,
            created_at,
            expires_at,
            author:profiles!stories_user_id_fkey(id, username, avatar_url)
          `)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(30);

        if (stories && stories.length > 0) {
          queryClient.setQueryData(['stories'], stories);
          
          // Preload story author avatars and first few story images
          const storyMedia = stories.slice(0, 8).flatMap((s: any) => [
            s.author?.avatar_url,
            s.media_type === 'image' ? s.media_url : null,
          ]).filter(Boolean);
          await Promise.all(storyMedia.map(preloadImage));
          
          // Preload video metadata for video stories
          const videoStories = stories
            .filter((s: any) => s.media_type === 'video')
            .slice(0, 3)
            .map((s: any) => s.media_url);
          await Promise.all(videoStories.map(preloadVideoMetadata));
        }

        // Step 8: Load friends list
        updateStatus('friends');
        const { data: friends } = await supabase
          .from('follows')
          .select(`
            following:profiles!follows_following_id_fkey(id, username, avatar_url, display_name)
          `)
          .eq('follower_id', uid)
          .limit(50);

        if (friends) {
          queryClient.setQueryData(['following', uid], friends);
          
          // Preload friend avatars
          const friendAvatars = friends
            .map((f: any) => f.following?.avatar_url)
            .filter(Boolean)
            .slice(0, 20);
          await Promise.all(friendAvatars.map(preloadImage));
        }

        // Step 9: Preload additional media in background
        updateStatus('media');
        
        // Preload clips/shorts thumbnails
        const { data: clips } = await supabase
          .from('posts')
          .select('id, thumbnail_url, media_url')
          .eq('type', 'short')
          .order('created_at', { ascending: false })
          .limit(10);

        if (clips) {
          const clipThumbnails = clips.map((c: any) => c.thumbnail_url).filter(Boolean);
          await Promise.all(clipThumbnails.map(preloadImage));
        }

        // Small delay to show 100%
        await new Promise(r => setTimeout(r, 100));
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