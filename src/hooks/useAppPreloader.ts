import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PreloadStatus {
  step: string;
  progress: number;
  isComplete: boolean;
}

const PRELOAD_STEPS = [
  { key: 'init', label: 'Initializing...', weight: 3 },
  { key: 'auth', label: 'Checking authentication...', weight: 7 },
  { key: 'profile', label: 'Loading profile...', weight: 8 },
  { key: 'posts', label: 'Loading feed...', weight: 15 },
  { key: 'stories', label: 'Loading stories...', weight: 10 },
  { key: 'conversations', label: 'Loading messages...', weight: 12 },
  { key: 'friends', label: 'Loading friends...', weight: 8 },
  { key: 'servers', label: 'Loading communities...', weight: 8 },
  { key: 'notifications', label: 'Checking notifications...', weight: 7 },
  { key: 'images', label: 'Loading media...', weight: 17 },
  { key: 'finalizing', label: 'Almost ready...', weight: 3 },
  { key: 'ready', label: 'Ready!', weight: 2 },
];

// Preload a single image with timeout
const preloadImage = (url: string, timeout = 4000): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!url || url.includes('.mp4') || url.includes('.webm') || url.includes('.mov')) {
      resolve(true);
      return;
    }
    
    const img = new Image();
    const timer = setTimeout(() => resolve(true), timeout);
    
    img.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(true); // Don't fail on errors
    };
    img.src = url;
  });
};

// Preload video metadata
const preloadVideoMeta = (url: string, timeout = 3000): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!url || (!url.includes('.mp4') && !url.includes('.webm'))) {
      resolve(true);
      return;
    }
    
    const video = document.createElement('video');
    const timer = setTimeout(() => resolve(true), timeout);
    
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      resolve(true);
    };
    video.onerror = () => {
      clearTimeout(timer);
      resolve(true);
    };
    video.preload = 'metadata';
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
      const imagesToPreload: string[] = [];
      const videosToPreload: string[] = [];

      try {
        // Step 1: Initialize
        updateStatus('init');
        await new Promise(r => setTimeout(r, 100));

        // Step 2: Check authentication
        updateStatus('auth');
        await new Promise(r => setTimeout(r, 50));
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          // Not logged in - fast track to ready for landing page
          updateStatus('profile');
          await new Promise(r => setTimeout(r, 100));
          updateStatus('posts');
          await new Promise(r => setTimeout(r, 100));
          updateStatus('finalizing');
          await new Promise(r => setTimeout(r, 150));
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
          if (profile.avatar_url) imagesToPreload.push(profile.avatar_url);
        }

        // Step 4: Prefetch posts
        updateStatus('posts');
        const { data: posts } = await supabase.rpc('get_posts_with_counts', {
          p_type: null,
          p_author_id: null,
          p_user_id: uid,
          p_offset: 0,
          p_limit: 20,
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

          // Collect media to preload
          transformedPosts.slice(0, 12).forEach((post: any) => {
            const url = post.thumbnail_url || post.media_url;
            if (url) {
              if (url.includes('.mp4') || url.includes('.webm')) {
                videosToPreload.push(url);
              } else {
                imagesToPreload.push(url);
              }
            }
            if (post.author?.avatar_url) imagesToPreload.push(post.author.avatar_url);
          });

          queryClient.setQueryData(
            ['infinite-posts', undefined, undefined, uid],
            {
              pages: [{ posts: transformedPosts, nextPage: transformedPosts.length >= 20 ? 1 : null }],
              pageParams: [0],
            }
          );
        }

        // Step 5: Load stories
        updateStatus('stories');
        const { data: stories } = await supabase
          .from('stories')
          .select(`
            id, media_url, created_at, user_id,
            profiles:user_id (id, username, avatar_url)
          `)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(25);

        if (stories && stories.length > 0) {
          queryClient.setQueryData(['stories'], stories);
          stories.slice(0, 15).forEach((story: any) => {
            if (story.media_url) {
              if (story.media_url.includes('.mp4') || story.media_url.includes('.webm')) {
                videosToPreload.push(story.media_url);
              } else {
                imagesToPreload.push(story.media_url);
              }
            }
            if (story.profiles?.avatar_url) imagesToPreload.push(story.profiles.avatar_url);
          });
        }

        // Step 6: Load conversations
        updateStatus('conversations');
        const { data: conversations } = await supabase
          .from('conversation_members')
          .select(`
            conversation_id,
            conversations!inner (id, name, is_group, avatar_url, updated_at)
          `)
          .eq('user_id', uid)
          .order('joined_at', { ascending: false })
          .limit(20);

        if (conversations) {
          queryClient.setQueryData(['conversations', uid], conversations);
          conversations.forEach((conv: any) => {
            if (conv.conversations?.avatar_url) imagesToPreload.push(conv.conversations.avatar_url);
          });
        }

        // Step 7: Load friends
        updateStatus('friends');
        const { data: friends } = await supabase
          .from('friend_requests')
          .select(`
            id, status, created_at,
            sender:sender_id (id, username, avatar_url),
            receiver:receiver_id (id, username, avatar_url)
          `)
          .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
          .eq('status', 'accepted')
          .limit(30);

        if (friends) {
          queryClient.setQueryData(['friends', uid], friends);
          friends.forEach((f: any) => {
            if (f.sender?.avatar_url) imagesToPreload.push(f.sender.avatar_url);
            if (f.receiver?.avatar_url) imagesToPreload.push(f.receiver.avatar_url);
          });
        }

        // Step 8: Load servers/communities
        updateStatus('servers');
        const { data: servers } = await supabase
          .from('server_members')
          .select(`
            server_id,
            servers!inner (id, name, icon_url, description)
          `)
          .eq('user_id', uid)
          .limit(15);

        if (servers) {
          queryClient.setQueryData(['user-servers', uid], servers);
          servers.forEach((s: any) => {
            if (s.servers?.icon_url) imagesToPreload.push(s.servers.icon_url);
          });
        }

        // Step 9: Check notifications
        updateStatus('notifications');
        const { count } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid)
          .eq('read', false);

        if (count !== null) {
          queryClient.setQueryData(['unread-notifications', uid], count);
        }

        // Step 10: Preload all collected media
        updateStatus('images', 0);
        const uniqueImages = [...new Set(imagesToPreload)].slice(0, 30);
        const uniqueVideos = [...new Set(videosToPreload)].slice(0, 8);
        const totalMedia = uniqueImages.length + uniqueVideos.length;

        if (totalMedia > 0) {
          let loaded = 0;
          
          // Preload images in parallel batches
          const imageBatches = [];
          for (let i = 0; i < uniqueImages.length; i += 6) {
            imageBatches.push(uniqueImages.slice(i, i + 6));
          }
          
          for (const batch of imageBatches) {
            await Promise.all(batch.map(url => preloadImage(url)));
            loaded += batch.length;
            updateStatus('images', loaded / totalMedia);
          }

          // Preload video metadata
          await Promise.all(uniqueVideos.map(async (url) => {
            await preloadVideoMeta(url);
            loaded++;
            updateStatus('images', loaded / totalMedia);
          }));
        }

        // Step 11: Finalizing
        updateStatus('finalizing');
        await new Promise(r => setTimeout(r, 100));

        // Step 12: Complete!
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
