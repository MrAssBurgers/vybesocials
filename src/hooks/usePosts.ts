import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { containsBlockedContent, filterBlockedContent } from '@/lib/contentModeration';
import { moderateContent } from '@/hooks/useModeration';
import { toast } from 'sonner';
import { setCachedProfiles } from '@/lib/profileCache';

// Utility to validate media URLs - now returns true for any non-empty URL
// so migrated posts with broken storage links still appear (with placeholder)
function isValidMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (typeof url !== 'string') return false;
  if (url.trim() === '') return false;
  if (url === 'undefined' || url === 'null') return false;
  return true; // Allow all URLs, broken ones will show placeholder
}

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
    display_name?: string | null;
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
          is_pinned,
          author:profiles!author_id (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .order('is_pinned', { ascending: false })
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

          const author = post.author as unknown as { id: string; username: string; display_name?: string | null; avatar_url: string | null };
          
          return {
            ...post,
            is_pinned: post.is_pinned ?? false,
            author,
            like_count: likesCount.count || 0,
            comment_count: commentsCount.count || 0,
            is_liked: userLikes.includes(post.id),
            is_bookmarked: userBookmarks.includes(post.id),
          };
        })
      );

      // Cache author profiles for instant lookups
      const authors = postsWithCounts
        .map(p => p.author)
        .filter((a): a is NonNullable<typeof a> => !!a);
      if (authors.length > 0) {
        setCachedProfiles(authors.map(a => ({
          id: a.id,
          username: a.username,
          display_name: a.display_name || null,
          avatar_url: a.avatar_url,
        })));
      }

      // Filter out posts without valid media URLs
      return postsWithCounts.filter(post => isValidMediaUrl(post.media_url));
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
          is_pinned,
          author:profiles!author_id (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .in('author_id', followingIds)
        .order('is_pinned', { ascending: false })
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

          const author = post.author as unknown as { id: string; username: string; display_name?: string | null; avatar_url: string | null };

          return {
            ...post,
            is_pinned: post.is_pinned ?? false,
            author,
            like_count: likesCount.count || 0,
            comment_count: commentsCount.count || 0,
            is_liked: userLikes.includes(post.id),
            is_bookmarked: userBookmarks.includes(post.id),
          };
        })
      );

      // Cache author profiles
      const authors = postsWithCounts
        .map(p => p.author)
        .filter((a): a is NonNullable<typeof a> => !!a);
      if (authors.length > 0) {
        setCachedProfiles(authors.map(a => ({
          id: a.id,
          username: a.username,
          display_name: a.display_name || null,
          avatar_url: a.avatar_url,
        })));
      }

      // Filter out posts without valid media URLs
      return postsWithCounts.filter(post => isValidMediaUrl(post.media_url));
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

      // Check for blocked content locally first
      const localCheck = containsBlockedContent(data.caption);
      if (localCheck.blocked) {
        toast.error('Your caption contains inappropriate content. Please revise.');
        throw new Error('Caption contains blocked content');
      }

      // Filter the caption
      const filteredCaption = filterBlockedContent(data.caption);

      // Upload media first
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
          caption: filteredCaption,
          tags: data.tags,
        })
        .select()
        .single();

      if (error) throw error;

      // Run AI moderation in background (non-blocking)
      if (filteredCaption.trim()) {
        moderateContent(filteredCaption, 'post', post.id).then(result => {
          if (result.requires_review) {
            console.log('Post flagged for review:', post.id);
          }
        }).catch(console.error);
      }

      return post;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Post created successfully!');
    },
    onError: (error) => {
      if (!error.message.includes('blocked content')) {
        toast.error('Failed to create post');
      }
    },
  });
}

export function useTogglePin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, isPinned }: { postId: string; isPinned: boolean }) => {
      const { error } = await supabase
        .from('posts')
        .update({ is_pinned: isPinned })
        .eq('id', postId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Post updated');
    },
    onError: () => {
      toast.error('Failed to update post');
    },
  });
}
