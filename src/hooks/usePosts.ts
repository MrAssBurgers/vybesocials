import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useFeedMuteFilter } from '@/hooks/useFeedMuteFilter';
import { containsBlockedContent, filterBlockedContent } from '@/lib/contentModeration';
import { optimizeForUpload, isVideoFile, generateVideoThumbnail, getCompressedExtension } from '@/lib/mediaOptimizer';
import { withTimeout } from '@/lib/withTimeout';
import { moderateContent } from '@/hooks/useModeration';
import { toast } from 'sonner';
import { isValidMediaUrl } from '@/lib/mediaUrl';
import { runPublishVybeCheck } from '@/lib/vybeCheck/runPublishVybeCheck';
import { challengeTypeForPost, recordChallengeActivity } from '@/lib/challengeProgressClient';
import { tokenAccountGuard, tokenMarketplaceRequest, type TokenAccountGuard } from '@/lib/tokenMarketplaceService';
import { useSocialFeed } from './useSocialFeed';
import { useSocialPostList } from './useSocialPostList';

export { isValidMediaUrl };

// Mutation-only metadata; never part of a persisted post or its public JSON.
const REUSED_GAME_POST = Symbol('reusedGamePost');
const POST_ACTOR_GUARD = Symbol('postActorGuard');
// The mutation already displayed the precise safety-check decision.
class NotifiedPublishCheckError extends Error {}

export function usePosts(type?: 'short' | 'post' | 'video', authorId?: string, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false && (authorId === undefined || !!authorId);
  const profile = useSocialPostList({ scope: 'profile', targetId: authorId, ...(type ? { contentType: type } : {}) }, enabled && !!authorId);
  const feed = useSocialFeed(type, enabled && !authorId);
  return useFeedMuteFilter(authorId ? profile : { ...feed, data: feed.data?.pages.flatMap(page => page.posts) }, !!authorId);
}

export function useFollowingPosts() {
  const feed = useSocialFeed(undefined, true, 'following');
  return { ...feed, data: feed.data?.pages.flatMap(page => page.posts) };
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
      /** Private, owner-checked game capture; publishes once across tabs/retries. */
      gameCaptureId?: string;
    }) => {
      if (!profile?.id || !profile?.user_id) {
        console.error('[usePosts] Cannot create post: profile missing or incomplete', { id: profile?.id, user_id: profile?.user_id });
        toast.error('Please sign in again to create a post.');
        throw new Error('Not authenticated');
      }
      const actorGuard = tokenAccountGuard(profile.user_id);
      actorGuard();

      if (data.gameCaptureId) {
        const [{ getGameCapture }, { findGameCapturePost }] = await Promise.all([
          import('@/lib/gameCaptureService'), import('@/lib/gameCapturePost'),
        ]);
        // Validate the capture against its server-owned session before resolving
        // a deterministic post. A supplied capture ID never grants ownership.
        const capture = await getGameCapture(data.gameCaptureId);
        const existing = await findGameCapturePost(data.gameCaptureId, profile.id);
        actorGuard();
        if (existing) return { ...existing, [REUSED_GAME_POST]: true, [POST_ACTOR_GUARD]: actorGuard };
        if (capture.status !== 'ready') throw new Error('This game capture is not ready to publish.');
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
      const uploadedPaths: string[] = [];

      // Overlap Vybe Check with media upload (check uses local files; post only on pass)
      const checkPromise = runPublishVybeCheck({
        caption: filteredCaption,
        tags: data.tags,
        mediaFile: data.mediaFile,
        mediaFiles: data.mediaFiles,
        contentType: data.type === 'text' ? 'text' : data.type,
      });

      let publicUrl: string | null = null;
      let mediaUrls: string[] | null = null;
      let thumbnailUrl: string | null = null;
      let gamePostWriteStarted = false;

      try {
        // Handle multi-file upload (carousel) with compression
        if (data.mediaFiles && data.mediaFiles.length > 0) {
          const uploadedUrls: string[] = [];
          for (const file of data.mediaFiles) {
            let uploadBlob: Blob = file;
            let fileExt = file.name.split('.').pop() || 'jpg';

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
            uploadedPaths.push(fileName);
            const { data: { publicUrl: url } } = db.storage.from('media').getPublicUrl(fileName);
            uploadedUrls.push(url);
          }
          publicUrl = uploadedUrls[0];
          mediaUrls = uploadedUrls;
        } else if (data.mediaFile) {
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

          const fileName = `${authUserId}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
          const { error: uploadError } = await withTimeout(
            db.storage.from('media').upload(fileName, uploadBlob),
            120000,
            'Upload timed out. Check your connection and try again.'
          );
          if (uploadError) throw uploadError;
          uploadedPaths.push(fileName);
          const { data: { publicUrl: url } } = db.storage.from('media').getPublicUrl(fileName);
          publicUrl = url;

          if (isVideoFile(data.mediaFile) && !data.thumbnailFile && !data.thumbnailDataUrl) {
            try {
              const thumbBlob = await withTimeout(
                generateVideoThumbnail(data.mediaFile),
                12000,
                'Video thumbnail timed out'
              );
              const thumbExt = getCompressedExtension();
              const thumbFileName = `${authUserId}/thumb_${Date.now()}-${crypto.randomUUID()}.${thumbExt}`;
              const { error: thumbErr } = await db.storage.from('media').upload(thumbFileName, thumbBlob, { contentType: `image/${thumbExt}` });
              if (!thumbErr) {
                uploadedPaths.push(thumbFileName);
                const { data: { publicUrl: thumbUrl } } = db.storage.from('media').getPublicUrl(thumbFileName);
                thumbnailUrl = thumbUrl;
              }
            } catch (e) {
              console.warn('[Media] Auto-thumbnail failed:', e);
            }
          }
        }

        if (data.thumbnailFile) {
          const thumbExt = data.thumbnailFile.name.split('.').pop();
          const thumbFileName = `${authUserId}/thumb_${Date.now()}-${crypto.randomUUID()}.${thumbExt}`;
          const { error: thumbError } = await db.storage.from('media').upload(thumbFileName, data.thumbnailFile);
          if (!thumbError) {
            uploadedPaths.push(thumbFileName);
            const { data: { publicUrl: thumbPublicUrl } } = db.storage.from('media').getPublicUrl(thumbFileName);
            thumbnailUrl = thumbPublicUrl;
          }
        } else if (data.thumbnailDataUrl) {
          try {
            const response = await fetch(data.thumbnailDataUrl);
            const blob = await response.blob();
            const thumbFileName = `${authUserId}/thumb_${Date.now()}-${crypto.randomUUID()}.jpg`;
            const { error: thumbError } = await db.storage.from('media').upload(thumbFileName, blob, { contentType: 'image/jpeg' });
            if (!thumbError) {
              uploadedPaths.push(thumbFileName);
              const { data: { publicUrl: thumbPublicUrl } } = db.storage.from('media').getPublicUrl(thumbFileName);
              thumbnailUrl = thumbPublicUrl;
            }
          } catch (e) {
            console.warn('Failed to upload generated thumbnail:', e);
          }
        }

        const vybe = await checkPromise;
        actorGuard();
        if (vybe.blocked || !vybe.allowed) {
          if (uploadedPaths.length) {
            await db.storage.from('media').remove(uploadedPaths).catch(() => {});
          }
          toast.error(vybe.message || 'Vybe Check did not pass.');
          throw new NotifiedPublishCheckError(vybe.message || 'Vybe Check blocked');
        }
        const resolvedAgeRating = data.age_rating || vybe.ageRating;

        const postType = data.type === 'text' ? 'post' : data.type;

        const postPayload = {
          author_id: profile.id,
          type: postType,
          media_url: publicUrl,
          media_urls: mediaUrls,
          thumbnail_url: thumbnailUrl,
          caption: filteredCaption,
          tags: data.tags,
          age_rating: resolvedAgeRating,
          vybe_check_id: vybe.checkId ?? null,
          vybe_check_status: 'approved',
        };
        let post: any;
        if (data.gameCaptureId) {
          const { saveGameCapturePost } = await import('@/lib/gameCapturePost');
          actorGuard();
          // Do not race a timeout against a transaction: it could commit after
          // cleanup removed its media. Firestore owns this operation's retries.
          gamePostWriteStarted = true;
          const saved = await saveGameCapturePost(data.gameCaptureId, profile.id, postPayload);
          post = saved.post;
          if (!saved.created) {
            if (uploadedPaths.length) await db.storage.from('media').remove(uploadedPaths).catch(() => {});
            return { ...post, [REUSED_GAME_POST]: true, [POST_ACTOR_GUARD]: actorGuard };
          }
        } else {
          const result = await withTimeout(
            db
              .from('posts')
              .insert(postPayload as any)
              .select()
              .single(),
            60000,
            'Saving post timed out. Please try again.',
          );
          if (result.error) throw result.error;
          post = result.data;
        }

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

        import('@/lib/aiDetection').then(({ detectAIContent }) => {
          detectAIContent(post.id, data.mediaFile || data.mediaFiles?.[0], filteredCaption)
            .then(result => {
              if (result.is_ai) {
                console.log('[AI Detection] Post flagged as AI-generated:', post.id, result);
              }
            })
            .catch(console.error);
        });

        return { ...post, [POST_ACTOR_GUARD]: actorGuard };
      } catch (err) {
        if (uploadedPaths.length && !gamePostWriteStarted) {
          await db.storage.from('media').remove(uploadedPaths).catch(() => {});
        }
        throw err;
      }
    },
    onSuccess: (_post, variables) => {
      const actorGuard = _post?.[POST_ACTOR_GUARD] as TokenAccountGuard | undefined;
      try { actorGuard?.(); } catch { return; }
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      void queryClient.invalidateQueries({ queryKey: ['social-post-list'] });
      void queryClient.invalidateQueries({ queryKey: ['profile-visible-post-count'] });
      queryClient.invalidateQueries({ queryKey: ['social-feed'] });
      // Profile counts are cached separately from profile post grids. Refresh
      // them so a successful publish never leaves “0 Posts” beside a visible post.
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['profile-by-id'] });
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
      if (!_post?.[REUSED_GAME_POST]) {
        recordChallengeActivity(profile?.id, challengeTypeForPost(variables.type));
      }
      // Retrying a recovered game post is safe: the server deduplicates its
      // retained source ID. A wallet outage must not turn a saved post into a
      // failed publish or pretend that a reward was granted.
      if (actorGuard && typeof _post?.id === 'string') {
        void tokenMarketplaceRequest({ action: 'earn', type: 'post_created', referenceId: _post.id }, actorGuard)
          .then(() => { actorGuard(); queryClient.invalidateQueries({ queryKey: ['token-marketplace', profile?.user_id] }); })
          .catch(() => {});
      }
    },
    onError: (error) => {
      console.error('[usePosts] Create post error:', error.message, error);
      const msg = error.message || '';
      if (
        error instanceof NotifiedPublishCheckError ||
        msg === 'Not authenticated' ||
        msg.includes('blocked content') ||
        msg.includes('Rate limited') ||
        msg.includes('Vybe Check')
      ) {
        return;
      }
      toast.error('Could not create your post. Please try again.');
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
      void queryClient.invalidateQueries({ queryKey: ['social-post-list'] });
      void queryClient.invalidateQueries({ queryKey: ['profile-visible-post-count'] });
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
