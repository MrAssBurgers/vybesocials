import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

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

export function useInfinitePosts(type?: 'short' | 'post' | 'video', authorId?: string) {
  const { profile } = useAuth();

  return useInfiniteQuery({
    queryKey: ['infinite-posts', type, authorId, profile?.id],
    queryFn: async ({ pageParam = 0 }): Promise<{ posts: Post[]; nextPage: number | null }> => {
      let query = supabase
        .from('posts')
        .select(`
          id,
          type,
          media_url,
          thumbnail_url,
          caption,
          tags,
          created_at,
          is_pinned,
          author:profiles!author_id (
            id,
            username,
            avatar_url
          )
        `)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1);

      if (type) {
        query = query.eq('type', type);
      }

      if (authorId) {
        query = query.eq('author_id', authorId);
      }

      const { data: posts, error } = await query;

      if (error) throw error;

      // Get likes and bookmarks for current user
      let userLikes: string[] = [];
      let userBookmarks: string[] = [];

      if (profile && posts && posts.length > 0) {
        const postIds = posts.map(p => p.id);
        const [likesResult, bookmarksResult] = await Promise.all([
          supabase.from('likes').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
          supabase.from('bookmarks').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
        ]);

        userLikes = likesResult.data?.map(l => l.post_id) || [];
        userBookmarks = bookmarksResult.data?.map(b => b.post_id) || [];
      }

      // Get counts for each post (batch query)
      const postsWithCounts = await Promise.all(
        (posts || []).map(async (post) => {
          const [likesCount, commentsCount] = await Promise.all([
            supabase.from('likes').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
            supabase.from('comments').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
          ]);

          return {
            ...post,
            is_pinned: post.is_pinned ?? false,
            author: post.author as unknown as { id: string; username: string; avatar_url: string | null },
            like_count: likesCount.count || 0,
            comment_count: commentsCount.count || 0,
            is_liked: userLikes.includes(post.id),
            is_bookmarked: userBookmarks.includes(post.id),
          };
        })
      );

      return {
        posts: postsWithCounts,
        nextPage: posts && posts.length === PAGE_SIZE ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
  });
}

export function useInfiniteFollowingPosts(type?: 'short' | 'post' | 'video') {
  const { profile } = useAuth();

  return useInfiniteQuery({
    queryKey: ['infinite-following-posts', type, profile?.id],
    queryFn: async ({ pageParam = 0 }): Promise<{ posts: Post[]; nextPage: number | null }> => {
      if (!profile) return { posts: [], nextPage: null };

      // Get following list
      const { data: following } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', profile.id);

      const followingIds = following?.map(f => f.following_id) || [];

      if (followingIds.length === 0) return { posts: [], nextPage: null };

      let query = supabase
        .from('posts')
        .select(`
          id,
          type,
          media_url,
          thumbnail_url,
          caption,
          tags,
          created_at,
          is_pinned,
          author:profiles!author_id (
            id,
            username,
            avatar_url
          )
        `)
        .in('author_id', followingIds)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1);

      if (type) {
        query = query.eq('type', type);
      }

      const { data: posts, error } = await query;

      if (error) throw error;

      // Get likes and bookmarks
      const postIds = posts?.map(p => p.id) || [];
      const [likesResult, bookmarksResult] = await Promise.all([
        supabase.from('likes').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
        supabase.from('bookmarks').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
      ]);

      const userLikes = likesResult.data?.map(l => l.post_id) || [];
      const userBookmarks = bookmarksResult.data?.map(b => b.post_id) || [];

      const postsWithCounts = await Promise.all(
        (posts || []).map(async (post) => {
          const [likesCount, commentsCount] = await Promise.all([
            supabase.from('likes').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
            supabase.from('comments').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
          ]);

          return {
            ...post,
            is_pinned: post.is_pinned ?? false,
            author: post.author as unknown as { id: string; username: string; avatar_url: string | null },
            like_count: likesCount.count || 0,
            comment_count: commentsCount.count || 0,
            is_liked: userLikes.includes(post.id),
            is_bookmarked: userBookmarks.includes(post.id),
          };
        })
      );

      return {
        posts: postsWithCounts,
        nextPage: posts && posts.length === PAGE_SIZE ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    enabled: !!profile,
  });
}
