import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useEffect, useCallback, useRef } from 'react';

interface Post {
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
}

// SPEED: Reduced initial page for faster first paint
const INITIAL_PAGE_SIZE = 8;
const PAGE_SIZE = 15;
const STALE_TIME = 2 * 60 * 1000; // 2 minutes - more aggressive caching
const GC_TIME = 30 * 60 * 1000; // 30 minutes

// Transform RPC result to Post format - optimized with minimal object creation
function transformPost(row: any): Post {
  return {
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
  };
}

// Preload images for upcoming posts - optimized with priority hints
function preloadPostMedia(posts: Post[], priority: 'high' | 'low' = 'low') {
  const toPreload = priority === 'high' ? posts.slice(0, 6) : posts.slice(0, 4);
  toPreload.forEach((post) => {
    const url = post.thumbnail_url || post.media_url;
    if (url) {
      // Use link preload for high priority (first load)
      if (priority === 'high' && typeof document !== 'undefined') {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = url;
        document.head.appendChild(link);
      } else {
        const img = new Image();
        img.src = url;
      }
    }
  });
}

export function useInfinitePosts(type?: 'short' | 'post' | 'video', authorId?: string) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const prefetchedRef = useRef<Set<number>>(new Set());
  const isFirstLoadRef = useRef(true);

  // Stable prefetch function
  const prefetchNextPage = useCallback((pageParam: number, currentOffset: number) => {
    if (prefetchedRef.current.has(pageParam + 1)) return;
    prefetchedRef.current.add(pageParam + 1);
    
    // Delay prefetch slightly to not block main thread
    setTimeout(() => {
      queryClient.prefetchInfiniteQuery({
        queryKey: ['infinite-posts', type, authorId, profile?.id],
        queryFn: async () => {
          const nextOffset = currentOffset + PAGE_SIZE;
          const { data, error } = await supabase.rpc('get_posts_with_counts', {
            p_type: type || null,
            p_author_id: authorId || null,
            p_user_id: profile?.id || null,
            p_offset: nextOffset,
            p_limit: PAGE_SIZE,
          });
          if (error) throw error;
          const posts = (data || []).map(transformPost);
          preloadPostMedia(posts);
          return { posts, nextPage: posts.length === PAGE_SIZE ? pageParam + 2 : null };
        },
        initialPageParam: 0,
      });
    }, 100);
  }, [queryClient, type, authorId, profile?.id]);

  const query = useInfiniteQuery({
    queryKey: ['infinite-posts', type, authorId, profile?.id],
    queryFn: async ({ pageParam = 0 }): Promise<{ posts: Post[]; nextPage: number | null }> => {
      // Use smaller page size for first load (faster first paint)
      const isFirstPage = pageParam === 0;
      const limit = isFirstPage && isFirstLoadRef.current ? INITIAL_PAGE_SIZE : PAGE_SIZE;
      const offset = isFirstPage ? 0 : INITIAL_PAGE_SIZE + (pageParam - 1) * PAGE_SIZE;
      
      const { data, error } = await supabase.rpc('get_posts_with_counts', {
        p_type: type || null,
        p_author_id: authorId || null,
        p_user_id: profile?.id || null,
        p_offset: offset,
        p_limit: limit,
      });

      if (error) throw error;

      const posts = (data || []).map(transformPost);
      
      // Preload images - high priority for first page
      if (isFirstPage) {
        isFirstLoadRef.current = false;
        preloadPostMedia(posts, 'high');
      } else {
        preloadPostMedia(posts);
      }
      
      // Prefetch next page for faster subsequent loads
      const hasMore = posts.length === limit;
      if (hasMore) {
        prefetchNextPage(pageParam, offset);
      }

      return {
        posts,
        nextPage: hasMore ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    // Enable placeholder data for instant perceived loading
    placeholderData: (previousData) => previousData,
  });

  return query;
}

export function useInfiniteFollowingPosts(type?: 'short' | 'post' | 'video') {
  const { profile } = useAuth();
  const isFirstLoadRef = useRef(true);

  const query = useInfiniteQuery({
    queryKey: ['infinite-following-posts', type, profile?.id],
    queryFn: async ({ pageParam = 0 }): Promise<{ posts: Post[]; nextPage: number | null }> => {
      if (!profile) return { posts: [], nextPage: null };

      // Use smaller page size for first load
      const isFirstPage = pageParam === 0;
      const limit = isFirstPage && isFirstLoadRef.current ? INITIAL_PAGE_SIZE : PAGE_SIZE;
      const offset = isFirstPage ? 0 : INITIAL_PAGE_SIZE + (pageParam - 1) * PAGE_SIZE;

      const { data, error } = await supabase.rpc('get_following_posts_with_counts', {
        p_user_id: profile.id,
        p_type: type || null,
        p_offset: offset,
        p_limit: limit,
      });

      if (error) throw error;

      const posts = (data || []).map(transformPost);
      
      if (isFirstPage) {
        isFirstLoadRef.current = false;
        preloadPostMedia(posts, 'high');
      } else {
        preloadPostMedia(posts);
      }

      return {
        posts,
        nextPage: posts.length === limit ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    enabled: !!profile,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });

  return query;
}


// Hook to prefetch posts before user navigates
export function usePrefetchPosts() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const hasPrefetched = useRef(false);

  useEffect(() => {
    if (!profile || hasPrefetched.current) return;
    hasPrefetched.current = true;

    // Prefetch main feed (no type filter) - most common view
    // Use requestIdleCallback for non-blocking prefetch
    const prefetch = () => {
      queryClient.prefetchInfiniteQuery({
        queryKey: ['infinite-posts', undefined, undefined, profile.id],
        queryFn: async () => {
          const { data } = await supabase.rpc('get_posts_with_counts', {
            p_type: null,
            p_author_id: null,
            p_user_id: profile.id,
            p_offset: 0,
            p_limit: INITIAL_PAGE_SIZE,
          });
          const posts = (data || []).map(transformPost);
          preloadPostMedia(posts, 'high');
          return { posts, nextPage: posts.length === INITIAL_PAGE_SIZE ? 1 : null };
        },
        initialPageParam: 0,
        staleTime: STALE_TIME,
      });
    };

    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(prefetch);
    } else {
      setTimeout(prefetch, 100);
    }
  }, [profile, queryClient]);
}
