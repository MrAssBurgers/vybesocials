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

// Personalized "For You" feed with ranking and diversity
export function usePersonalizedFeed(type?: 'short' | 'post' | 'video') {
  const { profile } = useAuth();

  return useInfiniteQuery({
    queryKey: ['personalized-feed', type, profile?.id],
    queryFn: async ({ pageParam = 0 }): Promise<{ posts: Post[]; nextPage: number | null }> => {
      if (!profile?.id) {
        // Cold start: return trending content
        const { data: trending, error } = await supabase
          .from('posts')
          .select(`
            id, type, media_url, thumbnail_url, caption, tags, created_at, is_pinned, view_count,
            author:profiles!author_id(id, username, avatar_url)
          `)
          .eq('type', type || 'post')
          .order('view_count', { ascending: false })
          .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1);

        if (error) throw error;

        const posts = await enrichPostsWithCounts(trending || [], null);
        return { posts, nextPage: posts.length === PAGE_SIZE ? pageParam + 1 : null };
      }

      // Get user's interests from profile
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('interests')
        .eq('id', profile.id)
        .single();

      // Get user's interaction history for scoring
      const { data: interactions } = await supabase
        .from('user_interactions')
        .select('post_id, interaction_type, duration_seconds')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(500);

      // Build interaction map
      const userInteractions = new Map<string, any>();
      const notInterestedPosts = new Set<string>();
      
      (interactions || []).forEach(i => {
        if (i.interaction_type === 'not_interested') {
          notInterestedPosts.add(i.post_id);
        }
      });

      // Get followed creators
      const { data: following } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', profile.id);

      const followingIds = following?.map(f => f.following_id) || [];

      // Candidate pool: mix of followed creators + trending + interest-based
      const candidateSize = PAGE_SIZE * 3; // Fetch more to enable filtering

      // Get posts from multiple sources
      const [followedPosts, trendingPosts] = await Promise.all([
        // Posts from followed creators
        followingIds.length > 0 
          ? supabase
              .from('posts')
              .select(`
                id, type, media_url, thumbnail_url, caption, tags, created_at, is_pinned, view_count,
                author:profiles!author_id(id, username, avatar_url)
              `)
              .in('author_id', followingIds)
              .eq('type', type || 'post')
              .order('created_at', { ascending: false })
              .limit(candidateSize)
          : { data: [] },
        // Trending/popular posts
        supabase
          .from('posts')
          .select(`
            id, type, media_url, thumbnail_url, caption, tags, created_at, is_pinned, view_count,
            author:profiles!author_id(id, username, avatar_url)
          `)
          .eq('type', type || 'post')
          .order('view_count', { ascending: false })
          .limit(candidateSize),
      ]);

      // Combine and deduplicate
      const allPosts = new Map<string, any>();
      [...(followedPosts.data || []), ...(trendingPosts.data || [])].forEach(post => {
        if (!notInterestedPosts.has(post.id)) {
          allPosts.set(post.id, post);
        }
      });

      // Score and rank posts
      const scoredPosts = Array.from(allPosts.values()).map(post => ({
        ...post,
        score: calculateEngagementScore(post, userInteractions),
      }));

      // Sort by score
      scoredPosts.sort((a, b) => b.score - a.score);

      // Apply diversity rules: don't show same creator too many times in a row
      const diversifiedPosts: any[] = [];
      const recentCreators: string[] = [];
      const maxConsecutive = 2;

      for (const post of scoredPosts) {
        if (diversifiedPosts.length >= PAGE_SIZE) break;

        const creatorId = post.author.id;
        const recentCount = recentCreators.slice(-maxConsecutive).filter(id => id === creatorId).length;

        if (recentCount < maxConsecutive) {
          diversifiedPosts.push(post);
          recentCreators.push(creatorId);
        }
      }

      // Fill remaining slots if needed
      if (diversifiedPosts.length < PAGE_SIZE) {
        for (const post of scoredPosts) {
          if (diversifiedPosts.length >= PAGE_SIZE) break;
          if (!diversifiedPosts.find(p => p.id === post.id)) {
            diversifiedPosts.push(post);
          }
        }
      }

      // Paginate
      const startIdx = pageParam * PAGE_SIZE;
      const pageSlice = diversifiedPosts.slice(startIdx, startIdx + PAGE_SIZE);

      const posts = await enrichPostsWithCounts(pageSlice, profile.id);
      return { 
        posts, 
        nextPage: pageSlice.length === PAGE_SIZE ? pageParam + 1 : null 
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
  });
}

// Helper to enrich posts with like/comment counts and user's interaction status
async function enrichPostsWithCounts(posts: any[], userId: string | null): Promise<Post[]> {
  if (posts.length === 0) return [];

  const postIds = posts.map(p => p.id);

  // Get counts and user interactions in parallel
  const [likeCounts, commentCounts, userLikes, userBookmarks] = await Promise.all([
    supabase
      .from('likes')
      .select('post_id')
      .in('post_id', postIds),
    supabase
      .from('comments')
      .select('post_id')
      .in('post_id', postIds),
    userId 
      ? supabase.from('likes').select('post_id').eq('user_id', userId).in('post_id', postIds)
      : { data: [] },
    userId
      ? supabase.from('bookmarks').select('post_id').eq('user_id', userId).in('post_id', postIds)
      : { data: [] },
  ]);

  // Count per post
  const likeCountMap = new Map<string, number>();
  const commentCountMap = new Map<string, number>();
  const userLikeSet = new Set((userLikes.data || []).map(l => l.post_id));
  const userBookmarkSet = new Set((userBookmarks.data || []).map(b => b.post_id));

  (likeCounts.data || []).forEach(l => {
    likeCountMap.set(l.post_id, (likeCountMap.get(l.post_id) || 0) + 1);
  });
  (commentCounts.data || []).forEach(c => {
    commentCountMap.set(c.post_id, (commentCountMap.get(c.post_id) || 0) + 1);
  });

  return posts.map(post => ({
    id: post.id,
    type: post.type,
    media_url: post.media_url,
    thumbnail_url: post.thumbnail_url,
    caption: post.caption || '',
    tags: post.tags || [],
    created_at: post.created_at,
    is_pinned: post.is_pinned || false,
    view_count: post.view_count || 0,
    author: {
      id: post.author.id,
      username: post.author.username,
      avatar_url: post.author.avatar_url,
    },
    like_count: likeCountMap.get(post.id) || 0,
    comment_count: commentCountMap.get(post.id) || 0,
    is_liked: userLikeSet.has(post.id),
    is_bookmarked: userBookmarkSet.has(post.id),
  }));
}
