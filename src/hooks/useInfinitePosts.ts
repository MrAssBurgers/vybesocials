import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useEffect, useRef } from 'react';
import { batchSignUrls, getCachedSignedUrl, needsSigning } from '@/lib/signedUrlCache';

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

// Optimized page sizes for faster initial load
const INITIAL_PAGE_SIZE = 20; // Reduced for faster initial render
const PAGE_SIZE = 20; // Load 20 more when scrolling
const STALE_TIME = 30 * 60 * 1000; // 30 minutes - reduce refetches
const GC_TIME = 3 * 60 * 60 * 1000; // 3 hour cache

// Transform RPC result to Post format
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

export function useInfinitePosts(type?: 'short' | 'post' | 'video', authorId?: string) {
  const { profile } = useAuth();

  const query = useInfiniteQuery({
    queryKey: ['infinite-posts', type, authorId, profile?.id],
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

      const posts = (data || []).map(transformPost);
      
      // Pre-sign all URLs BEFORE returning - this ensures instant image display
      await presignPostMedia(posts);
      
      // Now preload the signed images
      preloadSignedMedia(posts);

      const expectedSize = isFirstPage ? INITIAL_PAGE_SIZE : PAGE_SIZE;
      return {
        posts,
        nextPage: posts.length >= expectedSize ? pageParam + 1 : null,
        totalLoaded: offset + posts.length,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });

  return query;
}

export function useInfiniteFollowingPosts(type?: 'short' | 'post' | 'video') {
  const { profile } = useAuth();

  const query = useInfiniteQuery({
    queryKey: ['infinite-following-posts', type, profile?.id],
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

      const posts = (data || []).map(transformPost);
      
      // Pre-sign all URLs BEFORE returning
      await presignPostMedia(posts);
      preloadSignedMedia(posts);

      const expectedSize = isFirstPage ? INITIAL_PAGE_SIZE : PAGE_SIZE;
      return {
        posts,
        nextPage: posts.length >= expectedSize ? pageParam + 1 : null,
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

export function usePrefetchPosts() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const hasPrefetched = useRef(false);

  useEffect(() => {
    if (!profile || hasPrefetched.current) return;
    hasPrefetched.current = true;

    const prefetch = async () => {
      const cached = queryClient.getQueryData(['infinite-posts', undefined, undefined, profile.id]);
      if (cached) return;

      const { data } = await supabase.rpc('get_posts_with_counts', {
        p_type: null,
        p_author_id: null,
        p_user_id: profile.id,
        p_offset: 0,
        p_limit: INITIAL_PAGE_SIZE,
      });
      
      const posts = (data || []).map(transformPost);
      
      // Pre-sign before caching
      await presignPostMedia(posts);
      preloadSignedMedia(posts);
      
      queryClient.setQueryData(
        ['infinite-posts', undefined, undefined, profile.id],
        {
          pages: [{ posts, nextPage: posts.length >= INITIAL_PAGE_SIZE ? 1 : null, totalLoaded: posts.length }],
          pageParams: [0],
        }
      );
    };

    prefetch();
  }, [profile, queryClient]);
}
