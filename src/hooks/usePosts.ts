import { usePostMutations } from './usePostMutations';
import { useEffect, useMemo } from 'react';
import { useProfileAccount } from './useProfileAccount';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useFeedMuteFilter } from '@/hooks/useFeedMuteFilter';
import { toast } from 'sonner';
import { isValidMediaUrl } from '@/lib/mediaUrl';
import { challengeTypeForPost, recordChallengeActivity } from '@/lib/challengeProgressClient';
import { tokenMarketplaceRequest } from '@/lib/tokenMarketplaceService';
import { useSocialFeed } from './useSocialFeed';
import { useSocialPostList } from './useSocialPostList';

export { isValidMediaUrl };

// Mutation-only metadata; never part of a persisted post or its public JSON.
const REUSED_GAME_POST = Symbol('reusedGamePost');
const POST_ACTOR_GUARD = Symbol('postActorGuard');

export function usePosts(type?: 'short' | 'post' | 'video', authorId?: string, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false && (authorId === undefined || !!authorId);
  const profile = useSocialPostList({ scope: 'profile', targetId: authorId, ...(type ? { contentType: type } : {}) }, enabled && !!authorId, { includeCommentCounts: false });
  const feed = useSocialFeed(type, enabled && !authorId);
  return useFeedMuteFilter(authorId ? profile : { ...feed, data: feed.data?.pages.flatMap(page => page.posts) }, !!authorId);
}

export function useFollowingPosts() {
  const feed = useSocialFeed(undefined, true, 'following');
  return { ...feed, data: feed.data?.pages.flatMap(page => page.posts) };
}

export function useCreatePost() {
  const account = useProfileAccount(), queryClient = useQueryClient();
  const context = useMemo(() => ({ active: true, attempts: new Map<string, string>() }), [account.user?.id, account.profile?.id, account.session.epoch]);
  useEffect(() => { context.active = true; return () => { context.active = false; }; }, [context]);
  return useMutation({
    mutationFn: async (data: {
      type: 'short' | 'post' | 'video' | 'text'; mediaFile?: File; mediaFiles?: File[]; caption: string; tags: string[];
      thumbnailFile?: File; thumbnailDataUrl?: string; age_rating?: 'safe' | '13+' | '18+'; gameCaptureId?: string;
      /** Stable source identity when a provider asset is fetched again on retry. */
      publicationKey?: string;
    }) => {
      const actorGuard = () => { account.guard(); if (!context.active) throw Object.assign(new Error('This publisher is no longer open.'), { code: 'account-changed' }); };
      actorGuard();
      const fileKey = (file?: File) => file ? [file.name, file.size, file.type, file.lastModified] : null;
      const key = JSON.stringify([data.publicationKey || fileKey(data.mediaFile), data.mediaFiles?.map(fileKey), fileKey(data.thumbnailFile), data.thumbnailDataUrl, data.type, data.caption, data.tags, data.gameCaptureId, data.age_rating]);
      const postId = data.gameCaptureId ? 'game_' + data.gameCaptureId : context.attempts.get(key) || crypto.randomUUID();
      context.attempts.set(key, postId);
      const { runPostUpload } = await import('@/lib/postUploadPipeline'); actorGuard();
      const result = await runPostUpload({ ...data, profile: { id: account.profile!.id, user_id: account.user!.id }, clientPostId: postId }, () => {}, actorGuard);
      actorGuard();
      if ('failed' in result) throw new Error(result.reason);
      context.attempts.delete(key);
      return { ...result.post, [REUSED_GAME_POST]: !result.created, [POST_ACTOR_GUARD]: actorGuard };
    },
    onSuccess: (post, variables) => {
      const guard = post[POST_ACTOR_GUARD]; try { guard(); } catch { return; }
      for (const key of ['posts', 'social-post-list', 'profile-visible-post-count', 'social-feed', 'profile', 'profile-by-id']) void queryClient.invalidateQueries({ queryKey: [key] });
      if (!post[REUSED_GAME_POST]) recordChallengeActivity(account.profile?.id, challengeTypeForPost(variables.type));
      void tokenMarketplaceRequest({ action: 'earn', type: 'post_created', referenceId: post.id }, guard)
        .then(() => { guard(); void queryClient.invalidateQueries({ queryKey: ['token-marketplace', account.user?.id] }); }).catch(() => {});
    },
    onError: (error) => {
      try { account.guard(); if (!context.active) return; } catch { return; }
      if ('code' in error && error.code === 'account-changed') return;
      toast.error(error.message || 'Could not confirm your post. Retry the same draft.');
    },
  });
}

export const PIN_LIMIT = 3;

export function useTogglePin() {
  const actions = usePostMutations('pin');
  return useMutation({
    mutationFn: async ({ postId, isPinned, expectedRevision }: { postId: string; isPinned: boolean; expectedRevision?: string }) => {
      const revision = expectedRevision ?? (await actions.read(postId)).revision;
      actions.guard();
      if (!revision) throw new Error('This post is unavailable. Refresh your profile.');
      const result = await actions.mutate({ action: 'pin', postId, expectedRevision: revision, payload: { isPinned } });
      if (result.status !== 'published' || result.post?.isPinned !== isPinned) throw new Error('The pin change was not confirmed.');
      return result;
    },
    onSuccess: (result) => { try { actions.guard(); toast.success(result.post?.isPinned ? 'Pinned to your profile' : 'Unpinned'); } catch { /* Retired account. */ } },
    onError: (error) => { try { actions.guard(); toast.error(error.message || 'Failed to update pin'); } catch { /* Retired account. */ } },
  });
}
