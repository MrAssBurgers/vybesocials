import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useEffect } from 'react';

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

const PAGE_SIZE = 10;

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

export function useInfinitePosts(type?: 'short' | 'post' | 'video', authorId?: string) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Prefetch next page
  const prefetchNextPage = (pageParam: number) => {
    queryClient.prefetchInfiniteQuery({
      queryKey: ['infinite-posts', type, authorId, profile?.id],
      queryFn: async () => {
        const { data, error } = await supabase.rpc('get_posts_with_counts', {
          p_type: type || null,
          p_author_id: authorId || null,
          p_user_id: profile?.id || null,
          p_offset: (pageParam + 1) * PAGE_SIZE,
          p_limit: PAGE_SIZE,
        });
        if (error) throw error;
        const posts = (data || []).map(transformPost);
        return { posts, nextPage: posts.length === PAGE_SIZE ? pageParam + 2 : null };
      },
      initialPageParam: 0,
    });
  };

  const query = useInfiniteQuery({
    queryKey: ['infinite-posts', type, authorId, profile?.id],
    queryFn: async ({ pageParam = 0 }): Promise<{ posts: Post[]; nextPage: number | null }> => {
      const { data, error } = await supabase.rpc('get_posts_with_counts', {
        p_type: type || null,
        p_author_id: authorId || null,
        p_user_id: profile?.id || null,
        p_offset: pageParam * PAGE_SIZE,
        p_limit: PAGE_SIZE,
      });

      if (error) throw error;

      const posts = (data || []).map(transformPost);
      
      // Prefetch next page for faster subsequent loads
      if (posts.length === PAGE_SIZE) {
        prefetchNextPage(pageParam);
      }

      return {
        posts,
        nextPage: posts.length === PAGE_SIZE ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: 30000, // Cache for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });

  return query;
}

export function useInfiniteFollowingPosts(type?: 'short' | 'post' | 'video') {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['infinite-following-posts', type, profile?.id],
    queryFn: async ({ pageParam = 0 }): Promise<{ posts: Post[]; nextPage: number | null }> => {
      if (!profile) return { posts: [], nextPage: null };

      const { data, error } = await supabase.rpc('get_following_posts_with_counts', {
        p_user_id: profile.id,
        p_type: type || null,
        p_offset: pageParam * PAGE_SIZE,
        p_limit: PAGE_SIZE,
      });

      if (error) throw error;

      const posts = (data || []).map(transformPost);

      return {
        posts,
        nextPage: posts.length === PAGE_SIZE ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    enabled: !!profile,
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
  });

  return query;
}

// Hook to prefetch posts before user navigates
export function usePrefetchPosts() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profile) return;

    // Prefetch "For You" posts
    queryClient.prefetchInfiniteQuery({
      queryKey: ['infinite-posts', 'post', undefined, profile.id],
      queryFn: async () => {
        const { data } = await supabase.rpc('get_posts_with_counts', {
          p_type: 'post',
          p_author_id: null,
          p_user_id: profile.id,
          p_offset: 0,
          p_limit: PAGE_SIZE,
        });
        const posts = (data || []).map(transformPost);
        return { posts, nextPage: posts.length === PAGE_SIZE ? 1 : null };
      },
      initialPageParam: 0,
    });

    // Prefetch shorts/clips
    queryClient.prefetchInfiniteQuery({
      queryKey: ['infinite-posts', 'short', undefined, profile.id],
      queryFn: async () => {
        const { data } = await supabase.rpc('get_posts_with_counts', {
          p_type: 'short',
          p_author_id: null,
          p_user_id: profile.id,
          p_offset: 0,
          p_limit: PAGE_SIZE,
        });
        const posts = (data || []).map(transformPost);
        return { posts, nextPage: posts.length === PAGE_SIZE ? 1 : null };
      },
      initialPageParam: 0,
    });
  }, [profile, queryClient]);
}
