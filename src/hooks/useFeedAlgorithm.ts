import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

interface Post {
  id: string;
  type: string;
  media_url: string;
  thumbnail_url: string | null;
  caption: string;
  tags: string[];
  created_at: string;
  is_pinned: boolean;
  view_count: number;
  author: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  is_bookmarked: boolean;
}

interface InteractionSignals {
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  views: number;
  watchTime: number;
}

const PAGE_SIZE = 10;

// Record user interactions for personalization
export function useRecordInteraction() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      postId,
      interactionType,
      durationSeconds = 0,
    }: {
      postId: string;
      interactionType: 'view' | 'like' | 'comment' | 'share' | 'save' | 'not_interested' | 'watch_time';
      durationSeconds?: number;
    }) => {
      if (!profile?.id) return;

      // Upsert interaction - update duration if watch_time, otherwise just record
      const { error } = await db
        .from('user_interactions')
        .upsert({
          user_id: profile.id,
          post_id: postId,
          interaction_type: interactionType,
          duration_seconds: durationSeconds,
          created_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,post_id,interaction_type',
        });

      if (error) throw error;
    },
  });
}

// Mark post as "not interested"
export function useNotInterested() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const recordInteraction = useRecordInteraction();

  return useMutation({
    mutationFn: async (postId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      await recordInteraction.mutateAsync({
        postId,
        interactionType: 'not_interested',
      });

      return postId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personalized-feed'] });
      toast.success("We'll show you less content like this");
    },
  });
}

// Engagement scoring lives in src/lib/feedEngagementScore.ts (pure + tested).
export { calculateEngagementScore } from '@/lib/feedEngagementScore';

// Re-export from useInfinitePosts for backwards compatibility
export { usePersonalizedFeed } from './useInfinitePosts';
