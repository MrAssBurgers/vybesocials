import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProfileAccount } from './useProfileAccount';
import type { PostMutationDraft } from '@/lib/postMutationService';

export function usePostMutations(viewKey = '', options?: { allowStaffRead?: boolean }) {
  const account = useProfileAccount(), client = useQueryClient();
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const context = useMemo(() => ({ active: true, pending: false, actor: { uid: account.session.uid || '', profileId: account.profile?.id || '' }, check: account.guard }),
    // A retired view must not revive when the same account or post reopens.
    [account.session.uid, account.session.epoch, account.profile?.id, account.ready, viewKey]);
  useEffect(() => { context.active = true; return () => { context.active = false; }; }, [context]);
  const guard = useCallback(() => { context.check(); if (!context.active) throw Object.assign(new Error('This post view changed. Reopen it before continuing.'), { code: 'view-changed' }); }, [context]);
  const allowStaffRead = options?.allowStaffRead === true;
  const read = useCallback(async (postId: string) => {
    guard();
    const { managePost } = await import('@/lib/postMutationService');
    guard();
    return managePost(context.actor, { action: 'read', postId }, guard, { allowStaffRead });
  }, [context, guard, allowStaffRead]);
  const mutate = useCallback(async (request: PostMutationDraft) => {
    guard(); if (context.pending) throw new Error('A post change is still saving.');
    context.pending = true; refresh();
    try {
      const { managePost, postMutationAttempt } = await import('@/lib/postMutationService'); guard();
      const attempt = await postMutationAttempt(context.actor, request); guard();
      const result = await managePost(context.actor, { ...request, requestId: attempt.requestId }, guard);
      guard(); attempt.complete();
      for (const root of ['posts', 'post', 'social-feed', 'social-post-list', 'profile-visible-post-count', 'pinned-post-count', 'profile', 'profile-by-id']) void client.invalidateQueries({ queryKey: [root] });
      return result;
    } finally { context.pending = false; if (context.active) refresh(); }
  }, [context, guard, client]);
  const remove = useCallback(async (postId: string, expectedRevision?: string) => {
    const revision = expectedRevision ?? (await read(postId)).revision;
    guard(); if (!revision) throw new Error('This post is already unavailable. Refresh the page.');
    const result = await mutate({ action: 'delete', postId, expectedRevision: revision });
    if (result.status !== 'deleted') throw new Error('Post removal was not confirmed. Please retry.');
    return result;
  }, [read, guard, mutate]);
  return { read, mutate, remove, guard, actor: context.actor, contextKey: context, isPending: context.pending, ready: account.ready };
}
