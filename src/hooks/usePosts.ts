import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { containsBlockedContent, filterBlockedContent } from '@/lib/contentModeration';
import { optimizeForUpload, isVideoFile, generateVideoThumbnail, getCompressedExtension } from '@/lib/mediaOptimizer';
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
  view_count: number;
  is_ai_generated?: boolean;
  ai_confidence?: number;
  ai_override?: boolean | null;
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
          view_count,
          is_ai_generated,
          ai_confidence,
          ai_override,
          author:profiles!author_id (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500); // Explicit limit to avoid default 1000 row limit issues

      // Filter by type if specified, but don't over-filter
      if (type) {
        query = query.eq('type', type);
      }

      // Filter by author if specified
      if (authorId) {
        query = query.eq('author_id', authorId);
      }

      const { data: posts, error } = await query;

      if (error) {
        console.error('Failed to fetch posts:', error);
        throw error;
      }

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

          const author = post.author as unknown as { id: string; username: string; display_name?: string | null; avatar_url: string | null } | null;
          
          // Skip posts with no author
          if (!author) return null;
          
          return {
            ...post,
            is_pinned: post.is_pinned ?? false,
            view_count: (post as any).view_count ?? 0,
            author,
            like_count: likesCount.count || 0,
            comment_count: commentsCount.count || 0,
            is_liked: userLikes.includes(post.id),
            is_bookmarked: userBookmarks.includes(post.id),
          };
        })
      );

      // Filter out null entries (posts without authors) and invalid media
      const validPosts = postsWithCounts.filter((post): post is NonNullable<typeof post> => 
        post !== null && isValidMediaUrl(post.media_url)
      );

      // Cache author profiles for instant lookups
      const authors = validPosts
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

      return validPosts;
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
          view_count,
          author:profiles!author_id (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .in('author_id', followingIds)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        console.error('Failed to fetch following posts:', error);
        throw error;
      }

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

          const author = post.author as unknown as { id: string; username: string; display_name?: string | null; avatar_url: string | null } | null;

          // Skip posts with no author
          if (!author) return null;

          return {
            ...post,
            is_pinned: post.is_pinned ?? false,
            view_count: (post as any).view_count ?? 0,
            author,
            like_count: likesCount.count || 0,
            comment_count: commentsCount.count || 0,
            is_liked: userLikes.includes(post.id),
            is_bookmarked: userBookmarks.includes(post.id),
          };
        })
      );

      // Filter out null entries and invalid media
      const validPosts = postsWithCounts.filter((post): post is NonNullable<typeof post> => 
        post !== null && isValidMediaUrl(post.media_url)
      );

      // Cache author profiles
      const authors = validPosts
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

      return validPosts;
    },
    enabled: !!profile,
  });
}

export function useCreatePost() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      type: 'short' | 'post' | 'video' | 'text';
      mediaFile?: File;
      mediaFiles?: File[];
      caption: string;
      tags: string[];
      thumbnailFile?: File;
      thumbnailDataUrl?: string;
    }) => {
      if (!profile) throw new Error('Not authenticated');

      // Client-side rate limit: 5 posts per minute
      const { RATE_LIMITS } = await import('@/lib/rateLimit');
      if (!RATE_LIMITS.createPost()) {
        toast.error('Slow down! You can create up to 5 posts per minute.');
        throw new Error('Rate limited');
      }

      // Check for blocked content locally first
      const localCheck = containsBlockedContent(data.caption);
      if (localCheck.blocked) {
        toast.error('Your caption contains inappropriate content. Please revise.');
        throw new Error('Caption contains blocked content');
      }

      const filteredCaption = filterBlockedContent(data.caption);

      let publicUrl: string | null = null;
      let mediaUrls: string[] | null = null;
      let thumbnailUrl: string | null = null;

      // Handle multi-file upload (carousel) with compression
      if (data.mediaFiles && data.mediaFiles.length > 0) {
        const uploadedUrls: string[] = [];
        for (const file of data.mediaFiles) {
          let uploadBlob: Blob = file;
          let fileExt = file.name.split('.').pop() || 'jpg';

          // Compress images, skip videos
          if (!isVideoFile(file)) {
            try {
              const optimized = await optimizeForUpload(file, 'post');
              uploadBlob = optimized.file;
              fileExt = optimized.extension;
              if (optimized.savings > 0) {
                console.log(`[Media] Compressed ${file.name}: ${optimized.savings}% smaller`);
              }
            } catch (e) {
              console.warn('[Media] Compression failed, using original:', e);
            }
          }

          const fileName = `${profile.user_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('media').upload(fileName, uploadBlob);
          if (uploadError) throw uploadError;
          const { data: { publicUrl: url } } = supabase.storage.from('media').getPublicUrl(fileName);
          uploadedUrls.push(url);
        }
        publicUrl = uploadedUrls[0];
        mediaUrls = uploadedUrls;
      } else if (data.mediaFile) {
        // Single file upload with compression
        let uploadBlob: Blob = data.mediaFile;
        let fileExt = data.mediaFile.name.split('.').pop() || 'jpg';

        if (!isVideoFile(data.mediaFile)) {
          try {
            const optimized = await optimizeForUpload(data.mediaFile, 'post');
            uploadBlob = optimized.file;
            fileExt = optimized.extension;
            if (optimized.savings > 0) {
              console.log(`[Media] Compressed ${data.mediaFile.name}: ${optimized.savings}% smaller`);
            }
          } catch (e) {
            console.warn('[Media] Compression failed, using original:', e);
          }
        }

        const fileName = `${profile.user_id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('media').upload(fileName, uploadBlob);
        if (uploadError) throw uploadError;
        const { data: { publicUrl: url } } = supabase.storage.from('media').getPublicUrl(fileName);
        publicUrl = url;

        // Auto-generate video thumbnail if none provided
        if (isVideoFile(data.mediaFile) && !data.thumbnailFile && !data.thumbnailDataUrl) {
          try {
            const thumbBlob = await generateVideoThumbnail(data.mediaFile);
            const thumbExt = getCompressedExtension();
            const thumbFileName = `${profile.user_id}/thumb_${Date.now()}.${thumbExt}`;
            const { error: thumbErr } = await supabase.storage.from('media').upload(thumbFileName, thumbBlob, { contentType: `image/${thumbExt}` });
            if (!thumbErr) {
              const { data: { publicUrl: thumbUrl } } = supabase.storage.from('media').getPublicUrl(thumbFileName);
              thumbnailUrl = thumbUrl;
            }
          } catch (e) {
            console.warn('[Media] Auto-thumbnail failed:', e);
          }
        }
      }

      // Handle thumbnail upload for videos (if not auto-generated above)
      
      if (data.thumbnailFile) {
        const thumbExt = data.thumbnailFile.name.split('.').pop();
        const thumbFileName = `${profile.user_id}/thumb_${Date.now()}.${thumbExt}`;
        const { error: thumbError } = await supabase.storage.from('media').upload(thumbFileName, data.thumbnailFile);
        if (!thumbError) {
          const { data: { publicUrl: thumbPublicUrl } } = supabase.storage.from('media').getPublicUrl(thumbFileName);
          thumbnailUrl = thumbPublicUrl;
        }
      } else if (data.thumbnailDataUrl) {
        try {
          const response = await fetch(data.thumbnailDataUrl);
          const blob = await response.blob();
          const thumbFileName = `${profile.user_id}/thumb_${Date.now()}.jpg`;
          const { error: thumbError } = await supabase.storage.from('media').upload(thumbFileName, blob, { contentType: 'image/jpeg' });
          if (!thumbError) {
            const { data: { publicUrl: thumbPublicUrl } } = supabase.storage.from('media').getPublicUrl(thumbFileName);
            thumbnailUrl = thumbPublicUrl;
          }
        } catch (e) {
          console.warn('Failed to upload generated thumbnail:', e);
        }
      }

      // Determine post type
      const postType = data.type === 'text' ? 'post' : data.type;

      // Create post
      const { data: post, error } = await supabase
        .from('posts')
        .insert({
          author_id: profile.id,
          type: postType,
          media_url: publicUrl,
          media_urls: mediaUrls,
          thumbnail_url: thumbnailUrl,
          caption: filteredCaption,
          tags: data.tags,
        } as any)
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

      // Run AI content detection in background (non-blocking)
      import('@/lib/aiDetection').then(({ detectAIContent }) => {
        detectAIContent(post.id, data.mediaFile || data.mediaFiles?.[0], filteredCaption)
          .then(result => {
            if (result.is_ai) {
              console.log('[AI Detection] Post flagged as AI-generated:', post.id, result);
            }
          })
          .catch(console.error);
      });

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
