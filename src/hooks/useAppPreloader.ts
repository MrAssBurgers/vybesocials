import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PreloadStatus {
  step: string;
  progress: number;
  isComplete: boolean;
}

// Comprehensive preload steps for a premium loading experience
const PRELOAD_STEPS = [
  { key: 'init', label: 'Initializing...', weight: 5 },
  { key: 'auth', label: 'Checking session...', weight: 10 },
  { key: 'profile', label: 'Loading profile...', weight: 15 },
  { key: 'conversations', label: 'Loading conversations...', weight: 15 },
  { key: 'posts', label: 'Loading feed...', weight: 20 },
  { key: 'notifications', label: 'Loading notifications...', weight: 10 },
  { key: 'friends', label: 'Loading friends...', weight: 10 },
  { key: 'assets', label: 'Preparing assets...', weight: 10 },
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
    img.onerror = () => resolve();
    img.src = url;
  });
};

// Minimum display time for each step to feel premium
const MIN_STEP_TIME = 150;

// Delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
        await delay(MIN_STEP_TIME);

        // Step 2: Check authentication
        updateStatus('auth');
        const { data: { session } } = await supabase.auth.getSession();
        await delay(MIN_STEP_TIME);

        if (!session?.user) {
          // Not logged in - still show nice loading experience with public content
          updateStatus('profile');
          await delay(MIN_STEP_TIME);
          
          // Load trending/public posts for explore
          updateStatus('posts');
          const { data: publicPosts } = await supabase
            .from('posts')
            .select(`
              id, type, media_url, thumbnail_url, caption, tags, created_at, is_pinned,
              author:profiles!posts_author_id_fkey(id, username, avatar_url, is_verified)
            `)
            .order('created_at', { ascending: false })
            .limit(30);

          if (publicPosts) {
            // Preload some thumbnails
            const thumbnails = publicPosts
              .slice(0, 6)
              .map(p => p.thumbnail_url || p.media_url)
              .filter(Boolean);
            await Promise.all(thumbnails.map(url => preloadImage(url)));
          }
          await delay(MIN_STEP_TIME);

          // Prepare assets
          updateStatus('assets');
          await delay(MIN_STEP_TIME * 2);

          // Done
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
        await delay(MIN_STEP_TIME);

        // Step 4: Load conversations
        updateStatus('conversations');
        const { data: conversations } = await supabase
          .from('conversation_members')
          .select(`
            conversation:conversations!inner(id, name, is_group, avatar_url, updated_at),
            is_muted, is_pinned, last_read_at
          `)
          .eq('user_id', uid)
          .order('conversation(updated_at)', { ascending: false })
          .limit(30);

        if (conversations) {
          queryClient.setQueryData(['conversations', uid], conversations);
          // Preload conversation avatars
          const avatars = conversations
            .slice(0, 5)
            .map((c: any) => c.conversation?.avatar_url)
            .filter(Boolean);
          await Promise.all(avatars.map(url => preloadImage(url)));
        }
        await delay(MIN_STEP_TIME);

        // Step 5: Load posts
        updateStatus('posts');
        const { data: posts } = await supabase.rpc('get_posts_with_counts', {
          p_type: null,
          p_author_id: null,
          p_user_id: uid,
          p_offset: 0,
          p_limit: 50,
        });

        if (posts) {
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

          // Preload first few post images/thumbnails
          const mediaUrls = transformedPosts
            .slice(0, 8)
            .map((p: any) => p.thumbnail_url || p.media_url)
            .filter(Boolean);
          await Promise.all(mediaUrls.map(url => preloadImage(url)));
        }
        await delay(MIN_STEP_TIME);

        // Step 6: Load notifications
        updateStatus('notifications');
        const { data: notifications } = await supabase
          .from('notifications')
          .select(`id, type, read, created_at, post_id, actor:profiles!notifications_actor_id_fkey(id, username, avatar_url)`)
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(20);

        if (notifications) {
          queryClient.setQueryData(['notifications', uid], notifications);
        }
        await delay(MIN_STEP_TIME);

        // Step 7: Load friends
        updateStatus('friends');
        const { data: friendRequests } = await supabase
          .from('friend_requests')
          .select(`
            id, status, created_at,
            sender:profiles!friend_requests_sender_id_fkey(id, username, avatar_url, display_name),
            receiver:profiles!friend_requests_receiver_id_fkey(id, username, avatar_url, display_name)
          `)
          .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
          .eq('status', 'accepted')
          .limit(50);

        if (friendRequests) {
          queryClient.setQueryData(['accepted-friends', uid], friendRequests);
          // Preload friend avatars
          const friendAvatars = friendRequests
            .slice(0, 10)
            .flatMap((fr: any) => [fr.sender?.avatar_url, fr.receiver?.avatar_url])
            .filter(Boolean);
          await Promise.all(friendAvatars.map(url => preloadImage(url)));
        }
        await delay(MIN_STEP_TIME);

        // Step 8: Prepare final assets
        updateStatus('assets');
        await delay(MIN_STEP_TIME * 2);

        // Done!
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
