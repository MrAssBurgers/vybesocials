import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
      const { error } = await supabase
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

// Calculate engagement score for ranking
function calculateEngagementScore(post: any, userInteractions: Map<string, any>): number {
  const baseScore = 100;
  let score = baseScore;

  // Recency decay (posts older than 7 days get lower scores)
  const ageHours = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
  const recencyMultiplier = Math.max(0.3, 1 - (ageHours / (24 * 7)) * 0.7);
  
  // Engagement signals
  const likeWeight = 2;
  const commentWeight = 3;
  const viewWeight = 0.1;
  
  score += (post.like_count || 0) * likeWeight;
  score += (post.comment_count || 0) * commentWeight;
  score += (post.view_count || 0) * viewWeight;

  // Apply recency
  score *= recencyMultiplier;

  // Check user's past interactions with this creator
  const creatorInteractions = userInteractions.get(post.author.id);
  if (creatorInteractions) {
    // Boost posts from creators user has interacted with positively
    if (creatorInteractions.likes > 0) score *= 1.3;
    if (creatorInteractions.comments > 0) score *= 1.4;
    if (creatorInteractions.saves > 0) score *= 1.5;
  }

  // Penalize if user marked similar content as "not interested"
  const notInterestedCount = userInteractions.get('not_interested_' + post.id);
  if (notInterestedCount) {
    score *= 0.1; // Heavy penalty
  }

  return score;
}

// Re-export from useInfinitePosts for backwards compatibility
export { usePersonalizedFeed } from './useInfinitePosts';
