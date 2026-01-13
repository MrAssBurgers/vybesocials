import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useRef, useCallback } from 'react';

export interface StoryLike {
  id: string;
  story_id: string;
  user_id: string;
  created_at: string;
  profile?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

export function useStoryLikes(storyId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['story-likes', storyId],
    queryFn: async () => {
      if (!storyId) return { likes: [], hasLiked: false, count: 0 };

      const { data, error } = await supabase
        .from('story_likes')
        .select(`
          *,
          profile:profiles!user_id(id, username, avatar_url, display_name)
        `)
        .eq('story_id', storyId);

      if (error) throw error;

      const likes = (data || []) as unknown as StoryLike[];
      // Compare with auth user ID, not profile ID
      const hasLiked = user ? likes.some(l => l.user_id === user.id) : false;

      return { likes, hasLiked, count: likes.length };
    },
    enabled: !!storyId,
    staleTime: 10000, // Cache for 10 seconds
  });
}

export function useLikeStory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const pendingAction = useRef<'like' | 'unlike' | null>(null);

  const executeLike = useCallback(async (storyId: string, action: 'like' | 'unlike') => {
    if (!user?.id) throw new Error('Not authenticated');

    if (action === 'like') {
      // Use auth user ID, not profile ID - matches RLS policy
      const { error } = await supabase
        .from('story_likes')
        .insert({ story_id: storyId, user_id: user.id });
      if (error && !error.message.includes('duplicate')) throw error;
    } else {
      const { error } = await supabase
        .from('story_likes')
        .delete()
        .eq('story_id', storyId)
        .eq('user_id', user.id);
      if (error) throw error;
    }
  }, [user?.id]);

  return useMutation({
    mutationFn: async ({ storyId, action }: { storyId: string; action: 'like' | 'unlike' }) => {
      // Debounce rapid toggles
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      
      pendingAction.current = action;
      
      return new Promise<void>((resolve, reject) => {
        debounceRef.current = setTimeout(async () => {
          try {
            if (pendingAction.current) {
              await executeLike(storyId, pendingAction.current);
            }
            resolve();
          } catch (err) {
            reject(err);
          }
        }, 300);
      });
    },
    onMutate: async ({ storyId, action }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['story-likes', storyId] });

      // Snapshot previous value
      const previous = queryClient.getQueryData(['story-likes', storyId]);

      // Optimistically update
      queryClient.setQueryData(['story-likes', storyId], (old: any) => {
        if (!old) return old;
        
        if (action === 'like') {
          return {
            ...old,
            hasLiked: true,
            count: old.count + 1,
            likes: [...old.likes, {
              id: `optimistic-${Date.now()}`,
              story_id: storyId,
              user_id: user?.id, // Use auth user ID
              created_at: new Date().toISOString(),
            }],
          };
        } else {
          return {
            ...old,
            hasLiked: false,
            count: Math.max(0, old.count - 1),
            likes: old.likes.filter((l: StoryLike) => l.user_id !== user?.id), // Use auth user ID
          };
        }
      });

      return { previous };
    },
    onError: (err, { storyId }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['story-likes', storyId], context.previous);
      }
    },
    onSettled: (_, __, { storyId }) => {
      queryClient.invalidateQueries({ queryKey: ['story-likes', storyId] });
    },
  });
}
