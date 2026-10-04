import { useInfiniteQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useSocialFeed } from '@/hooks/useSocialFeed';
import { ensureMediaUrlsReady } from '@/lib/signedUrlCache';
import { useBlockedUserIds } from '@/hooks/useBlockedUsers';
import { useFeedMuteFilter } from '@/hooks/useFeedMuteFilter';
import { refetchFeedOnMount } from '@/lib/queryRefetchPolicy';
import { getEffectiveProfileId } from '@/lib/profileCache';
import { preloadFeedPostsMedia } from '@/lib/imagePreload';
import { hasMoreFeedRows, toFeedError } from '@/lib/feedReliability';

export interface Post {
  id: string;
  type: string;
  age_rating?: 'safe' | '13+' | '18+' | 'unrated';
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
    tags: Array.isArray(row.tags) ? row.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : [],
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
 * Preload images AFTER signing - uses cached signed URLs.
 * Capped to the first few posts of a page — the rest lazy-load in viewport.
 */
const PRELOAD_MEDIA_CAP = 12;

async function preparePostMedia(posts: Post[], eagerCount: number): Promise<void> {
  if (posts.length === 0) return;
  const eagerSlice = posts.slice(0, eagerCount);
  await ensureMediaUrlsReady(
    eagerSlice.flatMap((post) => [
      post.thumbnail_url,
      post.media_url,
      post.author?.avatar_url,
    ]),
  );
  preloadFeedPostsMedia(eagerSlice, eagerCount);

  const rest = posts.slice(eagerCount);
  if (rest.length === 0) return;
  void ensureMediaUrlsReady(
    rest.flatMap((post) => [
      post.thumbnail_url,
      post.media_url,
      post.author?.avatar_url,
    ]),
  ).then(() => preloadFeedPostsMedia(rest, PRELOAD_MEDIA_CAP)).catch(() => {});
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
        throw toFeedError(error);
      }

      let posts = mapFeedRows(data);

      // Feed views include the viewer's own new posts so successful publishing
      // has immediate, visible confirmation. Blocked creators remain hidden.
      if (!isProfileView && profileId) {
        const blocked = new Set(blockedIds);
        posts = posts.filter((p) => !blocked.has(p.author?.id));
      }

      // Sign + preload above-the-fold media before paint on first page
      if (isFirstPage && posts.length > 0) {
        void preparePostMedia(posts, PRELOAD_MEDIA_CAP).catch(() => {});
      } else {
        void preparePostMedia(posts, 0).catch(() => {});
      }

      const expectedSize = isFirstPage ? INITIAL_PAGE_SIZE : PAGE_SIZE;
      return {
        posts,
        nextPage: hasMoreFeedRows(data, expectedSize) ? pageParam + 1 : null,
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

  return useFeedMuteFilter(query, isProfileView);
}

/** Shared audience-checked feeds for Home, Clips and related videos. */
export function useInfiniteFollowingPosts(type?: 'short' | 'post' | 'video', options?: { enabled?: boolean }) {
  return useSocialFeed(type, options?.enabled !== false, 'following');
}
export function usePersonalizedFeed(type?: 'short' | 'post' | 'video', options?: { enabled?: boolean }) {
  return useSocialFeed(type, options?.enabled !== false, 'personalized');
}
