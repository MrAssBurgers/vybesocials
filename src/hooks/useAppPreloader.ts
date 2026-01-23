import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PreloadStatus {
  step: string;
  progress: number;
  isComplete: boolean;
}

// Granular preload steps with descriptive labels
const PRELOAD_STEPS = [
  { key: 'init', label: 'Waking up...', weight: 10 },
  { key: 'auth', label: 'Checking session...', weight: 15 },
  { key: 'profile', label: 'Loading your profile...', weight: 20 },
  { key: 'feed', label: 'Getting your feed...', weight: 30 },
  { key: 'messages', label: 'Syncing messages...', weight: 20 },
  { key: 'ready', label: 'Let\'s go! ✨', weight: 5 },
];

export function useAppPreloader() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PreloadStatus>({
    step: 'Waking up...',
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
      const startTime = performance.now();
      
      try {
        // Step 1: Initialize
        updateStatus('init');

        // Step 2: Check authentication
        updateStatus('auth');
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          // Guest mode - load public feed only
          updateStatus('feed');
          
          const { data: posts } = await supabase.rpc('get_posts_with_counts', {
            p_type: null,
            p_author_id: null,
            p_user_id: null,
            p_offset: 0,
            p_limit: 30,
          });

          if (posts) {
            const transformedPosts = (posts as any[]).map((row) => ({
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
              is_liked: false,
              is_bookmarked: false,
            }));

            queryClient.setQueryData(
              ['infinite-posts', undefined, undefined, null],
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

          console.log(`[Preloader] Guest mode complete - ${(performance.now() - startTime).toFixed(0)}ms`);
          updateStatus('ready');
          return;
        }

        const uid = session.user.id;

        // Step 3: Load profile first (fast, needed for other queries)
        updateStatus('profile');
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', uid)
          .maybeSingle();

        if (profileData) {
          queryClient.setQueryData(['profile', uid], profileData);
        }

        // Step 4: Load feed and conversations in parallel
        updateStatus('feed');

        const [feedResult, conversationsResult] = await Promise.allSettled([
          // Feed
          supabase.rpc('get_posts_with_counts', {
            p_type: null,
            p_author_id: null,
            p_user_id: uid,
            p_offset: 0,
            p_limit: 30,
          }),
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
        ]);

        updateStatus('messages');

        // Cache feed
        if (feedResult.status === 'fulfilled' && feedResult.value.data) {
          const posts = feedResult.value.data as any[];
          const transformedPosts = posts.map((row) => ({
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
              pages: [{ 
                posts: transformedPosts, 
                nextPage: transformedPosts.length >= 30 ? 1 : null, 
                totalLoaded: transformedPosts.length 
              }],
              pageParams: [0],
            }
          );
        }

        // Cache conversations
        if (conversationsResult.status === 'fulfilled' && conversationsResult.value.data) {
          queryClient.setQueryData(['conversations', uid], conversationsResult.value.data);
        }

        // Log performance
        console.log(`[Preloader] Complete - ${(performance.now() - startTime).toFixed(0)}ms`);
        
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
