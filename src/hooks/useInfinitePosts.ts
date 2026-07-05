import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useEffect, useRef } from 'react';
import { getCachedSignedUrl, needsSigning, ensureMediaUrlsReady } from '@/lib/signedUrlCache';
import { useBlockedUserIds } from '@/hooks/useBlockedUsers';
import { refetchFeedOnMount } from '@/lib/queryRefetchPolicy';
import { getEffectiveProfileId } from '@/lib/profileCache';

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

// Transform RPC result to Post format — returns null for malformed rows.
function transformPost(row: any): Post | null {
  const postId = row?.id || row?.post_id;
  if (!postId) return null;
  const authorId = row.author_id || row.author?.id || '';
  const username =
    row.author_username ||
    row.author?.username ||
    (authorId ? `user_${String(authorId).slice(0, 8)}` : 'unknown');
  return {
    id: postId,
    type: row.type || 'post',
    media_url: row.media_url || '',
    thumbnail_url: row.thumbnail_url ?? null,
    caption: row.caption || '',
    tags: row.tags || [],
    created_at: row.created_at || new Date().toISOString(),
    is_pinned: !!row.is_pinned,
    view_count: row.view_count || 0,
    author: {
      id: authorId,
      username,
      avatar_url: row.author_avatar_url ?? row.author?.avatar_url ?? null,
    },
    like_count: Number(row.like_count) || 0,
    comment_count: Number(row.comment_count) || 0,
    is_liked: row.is_liked || false,
    is_bookmarked: row.is_bookmarked || false,
    reaction_type: row.reaction_type || null,
  };
}

function mapFeedRows(rows: unknown): Post[] {
  return (Array.isArray(rows) ? rows : [])
    .map(transformPost)
    .filter((p): p is Post => p !== null && !!p.author?.id);
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
  await ensureMediaUrlsReady(urls);
}

/**
 * Preload images AFTER signing - uses cached signed URLs.
 * Capped to the first few posts of a page — the rest lazy-load in viewport,
 * so eager-downloading a whole page just competes for bandwidth.
 */
const PRELOAD_MEDIA_CAP = 4;

function preloadSignedMedia(allPosts: Post[]) {
  const posts = allPosts.slice(0, PRELOAD_MEDIA_CAP);
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

/** Primary ranked feed with safe fallback to the legacy posts RPC. */
async function fetchPersonalizedPosts(
  profileId: string,
  type: 'short' | 'post' | 'video' | undefined,
  offset: number,
  limit: number,
  blocked: Set<string>,
): Promise<Post[]> {
  const { data, error } = await db.rpc('get_ranked_feed_v2', {
    p_user_id: profileId,
    p_content_type: type ?? null,
    p_category: null,
    p_lat: null,
    p_lng: null,
    p_radius_miles: null,
    p_offset: offset,
    p_limit: limit,
  } as any);

  if (!error && data?.length) {
    return mapFeedRows(data).filter((p) => !blocked.has(p.author?.id));
  }

  if (error) {
    console.warn('[Feed] get_ranked_feed_v2 failed, using fallback:', error.message);
  }

  const { data: fallback, error: fallbackError } = await db.rpc('get_posts_with_counts', {
    p_type: type || null,
    p_author_id: null,
    p_user_id: profileId,
    p_offset: offset,
    p_limit: limit,
  });

  if (fallbackError) {
    console.warn('[Feed] get_posts_with_counts fallback failed:', fallbackError.message);
    return [];
  }

  return mapFeedRows(fallback).filter(
    (p) => p.author?.id !== profileId && !blocked.has(p.author?.id),
  );
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
  const profileId = getEffectiveProfileId(profile?.id);

  const query = useInfiniteQuery({
    queryKey: ['infinite-posts', type, authorId, profileId, blockedIds.length],
    queryFn: async ({ pageParam = 0 }): Promise<{ posts: Post[]; nextPage: number | null; totalLoaded: number }> => {
      const isFirstPage = pageParam === 0;
      const limit = isFirstPage ? INITIAL_PAGE_SIZE : PAGE_SIZE;
      const offset = isFirstPage ? 0 : INITIAL_PAGE_SIZE + (pageParam - 1) * PAGE_SIZE;

      const { data, error } = await db.rpc('get_posts_with_counts', {
        p_type: type || null,
        p_author_id: authorId || null,
        p_user_id: profileId || null,
        p_offset: offset,
        p_limit: limit,
      });

      if (error) {
        console.warn('[Feed] get_posts_with_counts failed:', error.message);
        return { posts: [], nextPage: null, totalLoaded: offset };
      }

      let posts = mapFeedRows(data);

      // For non-profile (feed) views: hide your own posts and posts from blocked users.
      if (!isProfileView && profileId) {
        const blocked = new Set(blockedIds);
        posts = posts.filter(
          (p) => p.author?.id !== profileId && !blocked.has(p.author?.id)
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
    refetchOnMount: refetchFeedOnMount,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true, // Stream fresh content the moment we're back online
    placeholderData: (previousData) => previousData,
    networkMode: 'always',
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
  const profileId = getEffectiveProfileId(profile?.id);

  const query = useInfiniteQuery({
    queryKey: ['infinite-following-posts', type, profileId, blockedIds.length],
    queryFn: async ({ pageParam = 0 }): Promise<{ posts: Post[]; nextPage: number | null }> => {
      if (!profileId) return { posts: [], nextPage: null };

      const isFirstPage = pageParam === 0;
      const limit = isFirstPage ? INITIAL_PAGE_SIZE : PAGE_SIZE;
      const offset = isFirstPage ? 0 : INITIAL_PAGE_SIZE + (pageParam - 1) * PAGE_SIZE;

      const { data, error } = await db.rpc('get_following_posts_with_counts', {
        p_user_id: profileId,
        p_type: type || null,
        p_offset: offset,
        p_limit: limit,
      });

      if (error) {
        console.warn('[Feed] get_following_posts_with_counts failed:', error.message);
        return { posts: [], nextPage: null };
      }

      let posts = mapFeedRows(data);

      // Hide your own posts and blocked users from the Following feed.
      const blocked = new Set(blockedIds);
      posts = posts.filter(
        (p) => p.author?.id !== profileId && !blocked.has(p.author?.id)
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
    enabled: tabEnabled && !!profileId,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: refetchFeedOnMount,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: (previousData) => previousData,
    networkMode: 'always',
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  return query;
}

export function usePrefetchPosts() {
  const { profile, user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const hasPrefetched = useRef(false);
  const profileId = getEffectiveProfileId(profile?.id);

  useEffect(() => {
    if (authLoading || !user || !profileId || hasPrefetched.current) return;

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
      const personalizedKey = ['personalized-feed-v2', undefined, profileId, blockedLen] as const;
      const followingKey = ['infinite-following-posts', undefined, profileId, blockedLen] as const;

      if (!queryClient.getQueryData(personalizedKey)) {
        const { data } = await db.rpc('get_ranked_feed_v2', {
          p_user_id: profileId,
          p_content_type: null,
          p_category: null,
          p_lat: null,
          p_lng: null,
          p_radius_miles: null,
          p_offset: 0,
          p_limit: INITIAL_PAGE_SIZE,
        } as any);
        const posts = mapFeedRows(data);
        if (posts.length > 0) {
          presignPostMedia(posts).then(() => preloadSignedMedia(posts)).catch(() => {});
          queryClient.setQueryData(personalizedKey, {
            pages: [{ posts, nextPage: posts.length >= INITIAL_PAGE_SIZE ? 1 : null }],
            pageParams: [0],
          });
        }
      }

      if (!queryClient.getQueryData(followingKey)) {
        const { data } = await db.rpc('get_following_posts_with_counts', {
          p_user_id: profileId,
          p_type: null,
          p_offset: 0,
          p_limit: INITIAL_PAGE_SIZE,
        });
        let posts = mapFeedRows(data);
        posts = posts.filter((p) => p.author?.id !== profileId);
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
  }, [authLoading, user, profileId, queryClient]);
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
  const { profile, user } = useAuth();
  const blockedIds = useBlockedUserIds();
  const tabEnabled = options?.enabled !== false;
  const profileId = getEffectiveProfileId(profile?.id);
  // Run even while profile hydrates — cold-start uses get_trending_feed when profileId is missing.
  const enabled = tabEnabled;

  return useInfiniteQuery({
    queryKey: ['personalized-feed-v2', type, profileId, blockedIds.length],
    queryFn: async ({ pageParam = 0 }): Promise<{ posts: Post[]; nextPage: number | null }> => {
      const limit = pageParam === 0 ? INITIAL_PAGE_SIZE : PAGE_SIZE;
      const offset = pageParam === 0 ? 0 : INITIAL_PAGE_SIZE + (pageParam - 1) * PAGE_SIZE;
      const blocked = new Set(blockedIds);

      // Cold start (signed-out / profile still loading): fall back to trending
      if (!profileId) {
        const { data, error } = await db.rpc('get_trending_feed', {
          p_content_type: type || 'post',
          p_page: pageParam,
          p_page_size: limit,
        } as any);
        if (error) {
          console.warn('[Feed] get_trending_feed failed:', error.message);
          return { posts: [], nextPage: null };
        }
        const posts = mapFeedRows(data);
        presignPostMedia(posts).then(() => preloadSignedMedia(posts)).catch(() => {});
        return { posts, nextPage: posts.length >= limit ? pageParam + 1 : null };
      }

      const posts = await fetchPersonalizedPosts(profileId, type, offset, limit, blocked);

      presignPostMedia(posts).then(() => preloadSignedMedia(posts)).catch(() => {});

      return { posts, nextPage: posts.length >= limit ? pageParam + 1 : null };
    },
    getNextPageParam: (last) => last.nextPage,
    initialPageParam: 0,
    enabled,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: refetchFeedOnMount,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: (previousData) => previousData,
    networkMode: 'always',
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}
