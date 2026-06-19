import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { containsBlockedContent, filterBlockedContent } from '@/lib/contentModeration';
import { optimizeForUpload, isVideoFile, generateVideoThumbnail, getCompressedExtension } from '@/lib/mediaOptimizer';
import { withTimeout } from '@/lib/withTimeout';
import { moderateContent } from '@/hooks/useModeration';
import { toast } from 'sonner';
import { setCachedProfiles } from '@/lib/profileCache';
import { resolveAuthorIds, fetchMemberProfiles } from '@/lib/dmMembershipRepair';
import { isValidMediaUrl } from '@/lib/mediaUrl';

export { isValidMediaUrl };

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
    is_verified?: boolean | null;
  };
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  is_bookmarked: boolean;
}

export function usePosts(
  type?: 'short' | 'post' | 'video',
  authorId?: string,
  options?: { enabled?: boolean },
) {
  const { profile } = useAuth();
  const queryEnabled =
    options?.enabled !== false && (authorId !== undefined ? !!authorId : true);

  return useQuery({
    queryKey: ['posts', type, authorId, profile?.id],
    enabled: queryEnabled,
    queryFn: async (): Promise<Post[]> => {
      // Pinned posts only matter when viewing a specific author's profile.
      // For global/feed views, sort purely by recency so a user pinning a post
      // doesn't bubble that post to the top of everyone else's feed.
      const isProfileView = !!authorId;

      let query = db
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
            avatar_url,
            is_verified
          )
        `);

      if (isProfileView) {
        const authorIds = await resolveAuthorIds(authorId!);
        query = authorIds.length <= 10
          ? query.in('author_id', authorIds)
          : query.eq('author_id', authorIds[0]!);
      }

      query = query.order('created_at', { ascending: false }).limit(500);

      if (type) {
        query = query.eq('type', type);
      }

      let feedExcludeAuthors: Set<string> | null = null;
      if (!isProfileView && profile?.id) {
        const { data: blocks } = await db
          .from('blocked_users')
          .select('blocked_id')
          .eq('blocker_id', profile.id);
        feedExcludeAuthors = new Set((blocks || []).map((b: any) => b.blocked_id).filter(Boolean));
        feedExcludeAuthors.add(profile.id);
      }

      const { data: rawPosts, error } = await query;

      if (error) {
        console.error('Failed to fetch posts:', error);
        throw error;
      }

      const posts = feedExcludeAuthors
        ? (rawPosts || []).filter((p: any) => !feedExcludeAuthors!.has(p.author_id))
        : rawPosts || [];

      const authorProfileMap = await fetchMemberProfiles(
        [...new Set((posts as any[]).map((p) => p.author_id).filter(Boolean))],
      );

      // Get likes and bookmarks for current user
      let userLikes: string[] = [];
      let userBookmarks: string[] = [];
      const userReactionMap: Record<string, string> = {};

      if (profile) {
        const [likesResult, bookmarksResult] = await Promise.all([
          db.from('likes').select('post_id, reaction_type').eq('user_id', profile.id),
          db.from('bookmarks').select('post_id').eq('user_id', profile.id),
        ]);

        userLikes = likesResult.data?.map(l => l.post_id) || [];
        userBookmarks = bookmarksResult.data?.map(b => b.post_id) || [];
        likesResult.data?.forEach(l => { if (l.reaction_type) userReactionMap[l.post_id] = l.reaction_type; });
      }

      // Get counts for each post
      const postsWithCounts = await Promise.all(
        (posts || []).map(async (post) => {
          const [likesCount, commentsCount] = await Promise.all([
            db.from('likes').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
            db.from('comments').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
          ]);

          const joinedAuthor = post.author as unknown as { id: string; username: string; display_name?: string | null; avatar_url: string | null; is_verified?: boolean | null } | null;
          const fallbackAuthor = authorProfileMap.get(post.author_id);
          const author = joinedAuthor?.username && !joinedAuthor.username.startsWith('user_')
            ? joinedAuthor
            : fallbackAuthor
              ? {
                  id: String(fallbackAuthor.id),
                  username: String(fallbackAuthor.username),
                  display_name: (fallbackAuthor.display_name as string | null) ?? null,
                  avatar_url: (fallbackAuthor.avatar_url as string | null) ?? null,
                  is_verified: (fallbackAuthor.is_verified as boolean | null) ?? null,
                }
              : joinedAuthor;
          
          if (!author?.username) return null;
          
          return {
            ...post,
            is_pinned: post.is_pinned ?? false,
            view_count: (post as any).view_count ?? 0,
            author,
            like_count: likesCount.count || 0,
            comment_count: commentsCount.count || 0,
            is_liked: userLikes.includes(post.id),
            is_bookmarked: userBookmarks.includes(post.id),
            reaction_type: userReactionMap[post.id] || null,
          };
        })
      );

      // Filter out null entries (posts without authors) and invalid media
      const validPosts = postsWithCounts.filter((post): post is NonNullable<typeof post> => 
        post !== null && isValidMediaUrl(post.media_url)
      );

      if (isProfileView) {
        validPosts.sort((a, b) => {
          const pinDiff = Number(b.is_pinned) - Number(a.is_pinned);
          if (pinDiff !== 0) return pinDiff;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      }

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
  });
}

export function useFollowingPosts() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['following-posts', profile?.id],
    queryFn: async (): Promise<Post[]> => {
      if (!profile) return [];

      // Get following list
      const { data: following } = await db
        .from('follows')
        .select('following_id')
        .eq('follower_id', profile.id);

      const followingIds = following?.map(f => f.following_id) || [];

      if (followingIds.length === 0) return [];

      const { data: posts, error } = await db
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
            avatar_url,
            is_verified
          )
        `)
        .in('author_id', followingIds)
        .neq('author_id', profile.id) // never show your own posts in the Following feed
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        console.error('Failed to fetch following posts:', error);
        throw error;
      }

      // Get likes and bookmarks
      const [likesResult, bookmarksResult] = await Promise.all([
        db.from('likes').select('post_id, reaction_type').eq('user_id', profile.id),
        db.from('bookmarks').select('post_id').eq('user_id', profile.id),
      ]);

      const userLikes = likesResult.data?.map(l => l.post_id) || [];
      const userBookmarks = bookmarksResult.data?.map(b => b.post_id) || [];
      const userReactionMap2: Record<string, string> = {};
      likesResult.data?.forEach(l => { if (l.reaction_type) userReactionMap2[l.post_id] = l.reaction_type; });

      const postsWithCounts = await Promise.all(
        (posts || []).map(async (post) => {
          const [likesCount, commentsCount] = await Promise.all([
            db.from('likes').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
            db.from('comments').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
          ]);

          const author = post.author as unknown as { id: string; username: string; display_name?: string | null; avatar_url: string | null; is_verified?: boolean | null } | null;

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
            reaction_type: userReactionMap2[post.id] || null,
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
      age_rating?: 'safe' | '13+' | '18+';
    }) => {
      if (!profile?.id || !profile?.user_id) {
        console.error('[usePosts] Cannot create post: profile missing or incomplete', { id: profile?.id, user_id: profile?.user_id });
        toast.error('Please sign in again to create a post.');
        throw new Error('Not authenticated');
      }

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

      const authUserId = profile.user_id;

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

          const fileName = `${authUserId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
          const { error: uploadError } = await withTimeout(
            db.storage.from('media').upload(fileName, uploadBlob),
            120000,
            'Upload timed out. Check your connection and try again.'
          );
          if (uploadError) throw uploadError;
          const { data: { publicUrl: url } } = db.storage.from('media').getPublicUrl(fileName);
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

        const fileName = `${authUserId}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await withTimeout(
          db.storage.from('media').upload(fileName, uploadBlob),
          120000,
          'Upload timed out. Check your connection and try again.'
        );
        if (uploadError) throw uploadError;
        const { data: { publicUrl: url } } = db.storage.from('media').getPublicUrl(fileName);
        publicUrl = url;

        // Auto-generate video thumbnail if none provided
        if (isVideoFile(data.mediaFile) && !data.thumbnailFile && !data.thumbnailDataUrl) {
          try {
            const thumbBlob = await withTimeout(
              generateVideoThumbnail(data.mediaFile),
              12000,
              'Video thumbnail timed out'
            );
            const thumbExt = getCompressedExtension();
            const thumbFileName = `${authUserId}/thumb_${Date.now()}.${thumbExt}`;
            const { error: thumbErr } = await db.storage.from('media').upload(thumbFileName, thumbBlob, { contentType: `image/${thumbExt}` });
            if (!thumbErr) {
              const { data: { publicUrl: thumbUrl } } = db.storage.from('media').getPublicUrl(thumbFileName);
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
        const thumbFileName = `${authUserId}/thumb_${Date.now()}.${thumbExt}`;
        const { error: thumbError } = await db.storage.from('media').upload(thumbFileName, data.thumbnailFile);
        if (!thumbError) {
          const { data: { publicUrl: thumbPublicUrl } } = db.storage.from('media').getPublicUrl(thumbFileName);
          thumbnailUrl = thumbPublicUrl;
        }
      } else if (data.thumbnailDataUrl) {
        try {
          const response = await fetch(data.thumbnailDataUrl);
          const blob = await response.blob();
          const thumbFileName = `${authUserId}/thumb_${Date.now()}.jpg`;
          const { error: thumbError } = await db.storage.from('media').upload(thumbFileName, blob, { contentType: 'image/jpeg' });
          if (!thumbError) {
            const { data: { publicUrl: thumbPublicUrl } } = db.storage.from('media').getPublicUrl(thumbFileName);
            thumbnailUrl = thumbPublicUrl;
          }
        } catch (e) {
          console.warn('Failed to upload generated thumbnail:', e);
        }
      }

      // Determine post type
      const postType = data.type === 'text' ? 'post' : data.type;

      // Create post
      const { data: post, error } = await withTimeout(
        db
          .from('posts')
          .insert({
            author_id: profile.id,
            type: postType,
            media_url: publicUrl,
            media_urls: mediaUrls,
            thumbnail_url: thumbnailUrl,
            caption: filteredCaption,
            tags: data.tags,
            age_rating: data.age_rating || 'safe',
          } as any)
          .select()
          .single(),
        60000,
        'Saving post timed out. Please try again.',
      );

      if (error) throw error;

      // Run AI moderation in background (non-blocking)
      if (filteredCaption.trim()) {
        moderateContent(filteredCaption, 'post', post.id).then(result => {
          if (result.requires_review) {
            console.log('Post flagged for review:', post.id);
            toast.message('Heads up', {
              description: 'Your post is live but under a quick review. We\'ll let you know if anything changes.',
              duration: 5000,
            });
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
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = JSON.stringify(q.queryKey).toLowerCase();
          return (
            key.includes('personalized-feed') ||
            key.includes('infinite-following') ||
            key.includes('infinite-posts')
          );
        },
      });
    },
    onError: (error) => {
      console.error('[usePosts] Create post error:', error.message, error);
      if (!error.message.includes('blocked content') && !error.message.includes('Rate limited')) {
        toast.error('Failed to create post. Please sign out and back in, then try again.');
      }
    },
  });
}

export const PIN_LIMIT = 3;

export function useTogglePin() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ postId, isPinned }: { postId: string; isPinned: boolean }) => {
      // When pinning, enforce per-author cap of PIN_LIMIT.
      // If the user is at the cap, auto-unpin their oldest pinned post so the
      // newest pin succeeds (matches IG/X/TikTok behavior).
      if (isPinned && profile?.id) {
        const { data: existingPins, error: pinErr } = await db
          .from('posts')
          .select('id, created_at')
          .eq('author_id', profile.id)
          .eq('is_pinned', true)
          .neq('id', postId)
          .order('created_at', { ascending: true });

        if (pinErr) throw pinErr;

        const pins = existingPins || [];
        if (pins.length >= PIN_LIMIT) {
          const toUnpin = pins.slice(0, pins.length - (PIN_LIMIT - 1));
          if (toUnpin.length > 0) {
            const { error: unpinErr } = await db
              .from('posts')
              .update({ is_pinned: false })
              .in('id', toUnpin.map((p) => p.id));
            if (unpinErr) throw unpinErr;
          }
        }
      }

      const { error } = await db
        .from('posts')
        .update({ is_pinned: isPinned })
        .eq('id', postId);

      if (error) throw error;
      return { postId, isPinned };
    },
    // Optimistic update: flip is_pinned everywhere immediately.
    onMutate: async ({ postId, isPinned }) => {
      await queryClient.cancelQueries({ queryKey: ['posts'] });
      const snapshots = queryClient.getQueriesData<any>({ queryKey: ['posts'] });
      snapshots.forEach(([key, value]) => {
        if (!Array.isArray(value)) return;
        queryClient.setQueryData(
          key,
          value.map((p: any) => (p?.id === postId ? { ...p, is_pinned: isPinned } : p))
        );
      });
      return { snapshots };
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['pinned-post-count'] });
      toast.success(vars.isPinned ? 'Pinned to your profile' : 'Unpinned');
    },
    onError: (_err, _vars, ctx) => {
      // Roll back optimistic update.
      ctx?.snapshots?.forEach(([key, value]: any) => {
        queryClient.setQueryData(key, value);
      });
      toast.error('Failed to update post');
    },
  });
}
