import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useEffect, useRef } from 'react';
import { batchSignUrls, getCachedSignedUrl, needsSigning } from '@/lib/signedUrlCache';
import { useBlockedUserIds } from '@/hooks/useBlockedUsers';

export interface Post {
  id: string;
  type: string;
  media_url: string;
  thumbnail_url: string | null;
  caption: string;
  tags: string[];
  created_at: string;
  is_pinned: boolean;
  author: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  is_bookmarked: boolean;
  reaction_type?: string | null;
  view_count?: number;
}

// Optimized page sizes for faster initial load
const INITIAL_PAGE_SIZE = 15; // Slightly larger for better initial content
const PAGE_SIZE = 15; // Load 15 more when scrolling
const STALE_TIME = 5 * 60 * 1000; // 5 minutes - show cached instantly, background refresh
const GC_TIME = 1000 * 60 * 60 * 24 * 14; // 14 days - keep feed cached for offline

// Transform RPC result to Post format
function transformPost(row: any): Post & { view_count?: number } {
  return {
    id: row.id,
    type: row.type,
    media_url: row.media_url,
    thumbnail_url: row.thumbnail_url,
    caption: row.caption || '',
    tags: row.tags || [],
    created_at: row.created_at,
    is_pinned: row.is_pinned,
    view_count: row.view_count || 0,
    author: {
      id: row.author_id,
      username: row.author_username,
      avatar_url: row.author_avatar_url,
    },
    like_count: Number(row.like_count) || 0,
    comment_count: Number(row.comment_count) || 0,
    is_liked: row.is_liked || false,
    is_bookmarked: row.is_bookmarked || false,
    reaction_type: row.reaction_type || null,
  };
}

/**
 * Batch pre-sign all media URLs for posts
 * This happens BEFORE rendering so images load instantly
 */
async function presignPostMedia(posts: Post[]): Promise<void> {
  const urls: string[] = [];
  
  for (const post of posts) {
    if (post.thumbnail_url) urls.push(post.thumbnail_url);
    if (post.media_url) urls.push(post.media_url);
    if (post.author?.avatar_url) urls.push(post.author.avatar_url);
  }
  
  // Batch sign all URLs in one go
  await batchSignUrls(urls);
}

/**
 * Preload images AFTER signing - uses cached signed URLs
 */
function preloadSignedMedia(posts: Post[]) {
  for (const post of posts) {
    const mediaUrl = post.thumbnail_url || post.media_url;
    if (mediaUrl) {
      const signedUrl = getCachedSignedUrl(mediaUrl);
      if (signedUrl && !needsSigning(signedUrl)) {
        const img = new Image();
        img.src = signedUrl;
      }
    }
    
    if (post.author?.avatar_url) {
      const signedAvatar = getCachedSignedUrl(post.author.avatar_url);
      if (signedAvatar && !needsSigning(signedAvatar)) {
        const avatar = new Image();
        avatar.src = signedAvatar;
      }
    }
  }
}

export function useInfinitePosts(
  type?: 'short' | 'post' | 'video',
  authorId?: string,
  options?: { enabled?: boolean },
) {
  const { profile } = useAuth();
  const blockedIds = useBlockedUserIds();
  const isProfileView = !!authorId;
  const enabled = options?.enabled !== false;

  const query = useInfiniteQuery({
    queryKey: ['infinite-posts', type, authorId, profile?.id, blockedIds.length],
    queryFn: async ({ pageParam = 0 }): Promise<{ posts: Post[]; nextPage: number | null; totalLoaded: number }> => {
      const isFirstPage = pageParam === 0;
      const limit = isFirstPage ? INITIAL_PAGE_SIZE : PAGE_SIZE;
      const offset = isFirstPage ? 0 : INITIAL_PAGE_SIZE + (pageParam - 1) * PAGE_SIZE;

      const { data, error } = await supabase.rpc('get_posts_with_counts', {
        p_type: type || null,
        p_author_id: authorId || null,
        p_user_id: profile?.id || null,
        p_offset: offset,
        p_limit: limit,
      });

      if (error) throw error;

      let posts = (data || []).map(transformPost);

      // For non-profile (feed) views: hide your own posts and posts from blocked users.
      if (!isProfileView && profile?.id) {
        const blocked = new Set(blockedIds);
        posts = posts.filter(
          (p) => p.author?.id !== profile.id && !blocked.has(p.author?.id)
        );
      }

      // Non-blocking: sign and preload URLs in background so posts render instantly
      presignPostMedia(posts).then(() => preloadSignedMedia(posts)).catch(() => {});

      const expectedSize = isFirstPage ? INITIAL_PAGE_SIZE : PAGE_SIZE;
      return {
        posts,
        nextPage: posts.length >= expectedSize ? pageParam + 1 : null,
        totalLoaded: offset + posts.length,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    enabled,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: false, // Use cached data instantly, no re-fetch on mount
    refetchOnWindowFocus: false,
    refetchOnReconnect: true, // Stream fresh content the moment we're back online
    placeholderData: (previousData) => previousData, // Show cached while fetching
    networkMode: 'offlineFirst', // Serve cache on slow/no internet instead of hanging
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  return query;
}

export function useInfiniteFollowingPosts(
  type?: 'short' | 'post' | 'video',
  options?: { enabled?: boolean },
) {
  const { profile } = useAuth();
  const blockedIds = useBlockedUserIds();
  const tabEnabled = options?.enabled !== false;

  const query = useInfiniteQuery({
    queryKey: ['infinite-following-posts', type, profile?.id, blockedIds.length],
    queryFn: async ({ pageParam = 0 }): Promise<{ posts: Post[]; nextPage: number | null }> => {
      if (!profile) return { posts: [], nextPage: null };

      const isFirstPage = pageParam === 0;
      const limit = isFirstPage ? INITIAL_PAGE_SIZE : PAGE_SIZE;
      const offset = isFirstPage ? 0 : INITIAL_PAGE_SIZE + (pageParam - 1) * PAGE_SIZE;

      const { data, error } = await supabase.rpc('get_following_posts_with_counts', {
        p_user_id: profile.id,
        p_type: type || null,
        p_offset: offset,
        p_limit: limit,
      });

      if (error) throw error;

      let posts = (data || []).map(transformPost);

      // Hide your own posts and blocked users from the Following feed.
      const blocked = new Set(blockedIds);
      posts = posts.filter(
        (p) => p.author?.id !== profile.id && !blocked.has(p.author?.id)
      );

      // Non-blocking URL signing
      presignPostMedia(posts).then(() => preloadSignedMedia(posts)).catch(() => {});

      const expectedSize = isFirstPage ? INITIAL_PAGE_SIZE : PAGE_SIZE;
      return {
        posts,
        nextPage: posts.length >= expectedSize ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    enabled: tabEnabled && !!profile,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: false, // Use cached data instantly
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: (previousData) => previousData,
    networkMode: 'offlineFirst',
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  return query;
}

export function usePrefetchPosts() {
  const { profile, user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const hasPrefetched = useRef(false);

  useEffect(() => {
    if (authLoading || !user || !profile?.id || hasPrefetched.current) return;

    const hasFeed = queryClient.getQueriesData({
      predicate: (q) => {
        const k = JSON.stringify(q.queryKey).toLowerCase();
        return (
          k.includes('personalized-feed-v2') ||
          k.includes('infinite-following-posts') ||
          k.includes('infinite-posts')
        );
      },
    }).some(([, data]) => {
      if (!data || typeof data !== 'object') return false;
      const pages = (data as { pages?: { posts?: unknown[] }[] }).pages;
      return Array.isArray(pages) && pages.some((p) => Array.isArray(p?.posts) && p.posts.length > 0);
    });
    if (hasFeed) {
      hasPrefetched.current = true;
      return;
    }
    hasPrefetched.current = true;

    const prefetch = async () => {
      const blockedLen = 0;
      const personalizedKey = ['personalized-feed-v2', undefined, profile.id, blockedLen] as const;
      const followingKey = ['infinite-following-posts', undefined, profile.id, blockedLen] as const;

      if (!queryClient.getQueryData(personalizedKey)) {
        const { data } = await supabase.rpc('get_ranked_feed_v2', {
          p_user_id: profile.id,
          p_content_type: null,
          p_category: null,
          p_lat: null,
          p_lng: null,
          p_radius_miles: null,
          p_offset: 0,
          p_limit: INITIAL_PAGE_SIZE,
        } as any);
        const posts = (data || []).map(transformPost);
        if (posts.length > 0) {
          presignPostMedia(posts).then(() => preloadSignedMedia(posts)).catch(() => {});
          queryClient.setQueryData(personalizedKey, {
            pages: [{ posts, nextPage: posts.length >= INITIAL_PAGE_SIZE ? 1 : null }],
            pageParams: [0],
          });
        }
      }

      if (!queryClient.getQueryData(followingKey)) {
        const { data } = await supabase.rpc('get_following_posts_with_counts', {
          p_user_id: profile.id,
          p_type: null,
          p_offset: 0,
          p_limit: INITIAL_PAGE_SIZE,
        });
        let posts = (data || []).map(transformPost);
        posts = posts.filter((p) => p.author?.id !== profile.id);
        if (posts.length > 0) {
          presignPostMedia(posts).then(() => preloadSignedMedia(posts)).catch(() => {});
          queryClient.setQueryData(followingKey, {
            pages: [{ posts, nextPage: posts.length >= INITIAL_PAGE_SIZE ? 1 : null }],
            pageParams: [0],
          });
        }
      }
    };

    void prefetch();
  }, [authLoading, user, profile, queryClient]);
}

// Personalized "For You" feed — uses the v2 ranking algorithm:
//   ranking_score (content quality + engagement velocity + creator level +
//   freshness, multiplied by a soft-log level cap, minus penalties)
//   + per-viewer personal_match score
//   + diversity-per-creator cap
//
// Higher creator levels give a real but capped reach boost (≤12% of score)
// so leveling up genuinely helps distribution without auto-winning.
export function usePersonalizedFeed(
  type?: 'short' | 'post' | 'video',
  options?: { enabled?: boolean },
) {
  const { profile } = useAuth();
  const blockedIds = useBlockedUserIds();
  const enabled = options?.enabled !== false;

  return useInfiniteQuery({
    queryKey: ['personalized-feed-v2', type, profile?.id, blockedIds.length],
    queryFn: async ({ pageParam = 0 }): Promise<{ posts: Post[]; nextPage: number | null }> => {
      const limit = pageParam === 0 ? INITIAL_PAGE_SIZE : PAGE_SIZE;
      const offset = pageParam === 0 ? 0 : INITIAL_PAGE_SIZE + (pageParam - 1) * PAGE_SIZE;
      const blocked = new Set(blockedIds);

      // Cold start (signed-out / no profile): fall back to trending
      if (!profile?.id) {
        const { data, error } = await supabase.rpc('get_trending_feed', {
          p_content_type: type || 'post',
          p_page: pageParam,
          p_page_size: limit,
        } as any);
        if (error) throw error;
        const posts = (data || []).map((r: any) => ({
          id: r.post_id ?? r.id,
          type: r.post_type ?? r.type,
          media_url: r.media_url,
          thumbnail_url: r.thumbnail_url,
          caption: r.caption || '',
          tags: r.tags || [],
          created_at: r.created_at,
          is_pinned: !!r.is_pinned,
          view_count: r.view_count || 0,
          author: {
            id: r.author_id,
            username: r.author_username,
            avatar_url: r.author_avatar || r.author_avatar_url,
          },
          like_count: Number(r.like_count) || 0,
          comment_count: Number(r.comment_count) || 0,
          is_liked: !!r.is_liked,
          is_bookmarked: !!r.is_bookmarked,
          reaction_type: r.reaction_type || null,
        } as Post));
        presignPostMedia(posts).then(() => preloadSignedMedia(posts)).catch(() => {});
        return { posts, nextPage: posts.length >= limit ? pageParam + 1 : null };
      }

      const { data, error } = await supabase.rpc('get_ranked_feed_v2', {
        p_user_id: profile.id,
        p_content_type: type ?? null,
        p_category: null,
        p_lat: null,
        p_lng: null,
        p_radius_miles: null,
        p_offset: offset,
        p_limit: limit,
      } as any);

      if (error) throw error;

      let posts = (data || []).map(transformPost);
      // RPC already excludes own posts and not_interested, but keep blocked filter as a safety net.
      posts = posts.filter((p) => !blocked.has(p.author?.id));

      presignPostMedia(posts).then(() => preloadSignedMedia(posts)).catch(() => {});

      return { posts, nextPage: posts.length >= limit ? pageParam + 1 : null };
    },
    getNextPageParam: (last) => last.nextPage,
    initialPageParam: 0,
    enabled,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: (previousData) => previousData,
    networkMode: 'offlineFirst',
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}

