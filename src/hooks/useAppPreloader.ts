import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PreloadStatus {
  step: string;
  progress: number;
  isComplete: boolean;
}

// Simplified steps - faster loading
const PRELOAD_STEPS = [
  { key: 'init', label: 'Initializing...', weight: 10 },
  { key: 'auth', label: 'Checking authentication...', weight: 20 },
  { key: 'profile', label: 'Loading profile...', weight: 30 },
  { key: 'data', label: 'Loading content...', weight: 30 },
  { key: 'ready', label: 'Ready!', weight: 10 },
];

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
        await new Promise(r => setTimeout(r, 100));

        // Step 2: Check authentication
        updateStatus('auth');
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          // Not logged in - go to ready
          updateStatus('ready');
          return;
        }

        const uid = session.user.id;

        // Step 3: Load profile only
        updateStatus('profile');
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, display_name')
          .eq('id', uid)
          .maybeSingle();

        if (profile) {
          queryClient.setQueryData(['profile', uid], profile);
        }

        // Step 4: Quick data prefetch (non-blocking)
        updateStatus('data');
        
        // Just prefetch the first page of posts - let infinite scroll handle the rest
        supabase.rpc('get_posts_with_counts', {
          p_type: null,
          p_author_id: null,
          p_user_id: uid,
          p_offset: 0,
          p_limit: 15,
        }).then(({ data: posts }) => {
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
                pages: [{ posts: transformedPosts, nextPage: transformedPosts.length >= 15 ? 1 : null }],
                pageParams: [0],
              }
            );
          }
        });

        // Small delay then ready
        await new Promise(r => setTimeout(r, 200));
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
