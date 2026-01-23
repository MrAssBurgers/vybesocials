import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PreloadStatus {
  step: string;
  progress: number;
  isComplete: boolean;
}

// Ultra-fast preload - minimal steps for immediate startup
const PRELOAD_STEPS = [
  { key: 'init', label: 'Starting...', weight: 15 },
  { key: 'auth', label: 'Authenticating...', weight: 25 },
  { key: 'data', label: 'Loading...', weight: 50 },
  { key: 'ready', label: 'Ready!', weight: 10 },
];

export function useAppPreloader() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PreloadStatus>({
    step: 'Starting...',
    progress: 5,
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
        // Step 1: Initialize - instant
        updateStatus('init');

        // Step 2: Check authentication - fast
        updateStatus('auth');
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          // Not logged in - done instantly
          console.log(`[Preloader] Guest mode - ${(performance.now() - startTime).toFixed(0)}ms`);
          updateStatus('ready');
          return;
        }

        const uid = session.user.id;

        // Step 3: Load critical data in a single parallel batch
        updateStatus('data');
        
        const results = await Promise.allSettled([
          // Conversations - lightweight query
          supabase
            .from('conversation_members')
            .select(`
              conversation:conversations!inner(id, name, is_group, avatar_url, updated_at),
              is_muted, is_pinned, last_read_at
            `)
            .eq('user_id', uid)
            .order('conversation(updated_at)', { ascending: false })
            .limit(20),
          
          // Posts - use optimized RPC with lower limit
          supabase.rpc('get_posts_with_counts', {
            p_type: null,
            p_author_id: null,
            p_user_id: uid,
            p_offset: 0,
            p_limit: 30,
          }),
          
          // Profile - get minimal data
          supabase
            .from('profiles')
            .select('id, username, avatar_url, display_name')
            .eq('id', uid)
            .maybeSingle(),
        ]);

        // Cache all results at once
        const [conversationsResult, postsResult, profileResult] = results;

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