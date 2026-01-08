import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

export function usePosts(type?: 'short' | 'post' | 'video', authorId?: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['posts', type, authorId, profile?.id],
    queryFn: async (): Promise<Post[]> => {
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
          author:profiles!author_id (
            id,
            username,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false });

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

      if (profile) {
        const [likesResult, bookmarksResult] = await Promise.all([
          supabase.from('likes').select('post_id').eq('user_id', profile.id),
          supabase.from('bookmarks').select('post_id').eq('user_id', profile.id),
        ]);

        userLikes = likesResult.data?.map(l => l.post_id) || [];
        userBookmarks = bookmarksResult.data?.map(b => b.post_id) || [];
      }

      // Get counts for each post
      const postsWithCounts = await Promise.all(
        (posts || []).map(async (post) => {
          const [likesCount, commentsCount] = await Promise.all([
            supabase.from('likes').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
            supabase.from('comments').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
          ]);

          return {
            ...post,
            author: post.author as unknown as { id: string; username: string; avatar_url: string | null },
            like_count: likesCount.count || 0,
            comment_count: commentsCount.count || 0,
            is_liked: userLikes.includes(post.id),
            is_bookmarked: userBookmarks.includes(post.id),
          };
        })
      );

      return postsWithCounts;
    },
    enabled: true,
  });
}

export function useFollowingPosts() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['following-posts', profile?.id],
    queryFn: async (): Promise<Post[]> => {
      if (!profile) return [];

      // Get following list
      const { data: following } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', profile.id);

      const followingIds = following?.map(f => f.following_id) || [];

      if (followingIds.length === 0) return [];

      const { data: posts, error } = await supabase
        .from('posts')
        .select(`
          id,
          type,
          media_url,
          thumbnail_url,
          caption,
          tags,
          created_at,
          author:profiles!author_id (
            id,
            username,
            avatar_url
          )
        `)
        .in('author_id', followingIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get likes and bookmarks
      const [likesResult, bookmarksResult] = await Promise.all([
        supabase.from('likes').select('post_id').eq('user_id', profile.id),
        supabase.from('bookmarks').select('post_id').eq('user_id', profile.id),
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
            author: post.author as unknown as { id: string; username: string; avatar_url: string | null },
            like_count: likesCount.count || 0,
            comment_count: commentsCount.count || 0,
            is_liked: userLikes.includes(post.id),
            is_bookmarked: userBookmarks.includes(post.id),
          };
        })
      );

      return postsWithCounts;
    },
    enabled: !!profile,
  });
}

export function useCreatePost() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      type: 'short' | 'post' | 'video';
      mediaFile: File;
      caption: string;
      tags: string[];
    }) => {
      if (!profile) throw new Error('Not authenticated');

      // Upload media
      const fileExt = data.mediaFile.name.split('.').pop();
      const fileName = `${profile.user_id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(fileName, data.mediaFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);

      // Create post
      const { data: post, error } = await supabase
        .from('posts')
        .insert({
          author_id: profile.id,
          type: data.type,
          media_url: publicUrl,
          caption: data.caption,
          tags: data.tags,
        })
        .select()
        .single();

      if (error) throw error;

      return post;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}
