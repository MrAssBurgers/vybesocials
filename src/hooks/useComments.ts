import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { filterBlockedContent, containsBlockedContent } from '@/lib/contentModeration';
import { scanText as nsfwScanText } from '@/lib/nsfwScanner';
import { moderateContent } from '@/hooks/useModeration';
import { toast } from 'sonner';
import { useBumpReactionStreak } from './useReactionStreaks';
import { useTokenReward } from './useVybeTokens';
import { recordChallengeActivity } from '@/lib/challengeProgressClient';
import { tokenAccountGuard, type TokenAccountGuard } from '@/lib/tokenMarketplaceService';

import { changeComment, saveCommentChange } from '@/lib/commentChanges';
import { useEffect, useState } from 'react';
import { readCommentsPage, type Comment } from '@/lib/commentService';
import { useProfileAccount } from './useProfileAccount';

const COMMENT_REWARD_ACCOUNT = Symbol('comment-reward-account');

export function useComments(postId: string, access?: { scope: string }) {
  const account = useProfileAccount();
  const { profile, user, session } = account;
  const [view, setView] = useState({ visible: document.visibilityState !== 'hidden', epoch: 0, now: Date.now() });
  useEffect(() => {
    const tick = () => setView(value => ({ ...value, now: Date.now() }));
    const visibility = () => setView(value => ({ visible: document.visibilityState !== 'hidden', epoch: value.epoch + 1, now: Date.now() }));
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', visibility);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  const valid = !!postId && account.ready;
  const queryKey = ['comments', postId, user?.id, session.epoch, profile?.id, access?.scope, view.epoch];
  const query = useInfiniteQuery({
    queryKey, gcTime: 0, staleTime: 0, retry: false, initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => readCommentsPage({ expectedOwnerUid: user!.id, expectedProfileId: profile!.id, postId,
      ...(pageParam ? { cursor: pageParam } : {}) }, account.guard, signal),
    getNextPageParam: (last, _pages, _last, params) => last.nextCursor && !params.includes(last.nextCursor) ? last.nextCursor : undefined,
    enabled: valid && view.visible, refetchInterval: 20000, refetchOnWindowFocus: 'always',
  });
  const comments: Comment[] = [], seen = new Set<string>();
  if (valid && view.visible && !query.isError) for (const page of query.data?.pages ?? []) {
    if (page.leaseUntil <= view.now) continue;
    for (const comment of page.comments) if (!seen.has(comment.id)) { seen.add(comment.id); comments.push({ ...comment, text: filterBlockedContent(comment.text) }); }
  }
  const expired = !!query.data && query.data.pages.some(page => page.leaseUntil <= view.now);
  return { ...query, data: comments, queryKey, isError: query.isError || expired, isExpired: expired };
}
export function useCreateComment() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const bumpStreak = useBumpReactionStreak();
  const { rewardComment } = useTokenReward();

  const mutation = useMutation({
    mutationFn: async ({ postId, text, authorId, imageUrl }: { postId: string; text: string; authorId: string; imageUrl?: string }) => {
      if (!user || !profile || profile.user_id !== user.id) throw new Error('Not authenticated');
      const rewardAccount = tokenAccountGuard(user.id);
      rewardAccount();

      // Check for blocked content before submitting
      const check = containsBlockedContent(text);
      if (check.blocked) {
        toast.error('Your comment contains inappropriate content. Please revise.');
        throw new Error('Comment contains blocked content');
      }

      const filteredText = filterBlockedContent(text);

      // Run AI safety scan on the comment text before inserting
      let isFlagged = false;
      let safetyScore = 0;
      let safetyCategories: string[] = [];

      if (filteredText.trim()) {
        try {
          const scanResult = nsfwScanText(filteredText);

          safetyScore = scanResult.score ?? 0;
          safetyCategories = scanResult.categories ?? [];
          
          if (scanResult.result === 'blocked') {
            toast.error(scanResult.message || 'This comment violates community guidelines.');
            throw new Error('Comment blocked by safety check');
          }
          
          if (scanResult.result === 'warned') {
            isFlagged = true;
          }
        } catch (err: any) {
          if (err.message === 'Comment blocked by safety check') throw err;
          console.warn('Safety scan failed, allowing comment:', err);
        }
      }

      rewardAccount();
      const receipt = await saveCommentChange({ action: 'create', postId, text: filteredText, imageUrl: imageUrl || null,
        isFlagged, safetyScore, safetyCategories }, profile.id, rewardAccount);
      const data = { id: receipt.commentId };
      const saved = { ...data, [COMMENT_REWARD_ACCOUNT]: rewardAccount };
      // The comment is durable. A changed account must not trigger follow-up
      // requests or turn that successful save into a failed-send retry.
      try { rewardAccount(); } catch { return saved; }

      // Create notification + bump reaction streak (best-effort — must NEVER
      // fail the comment mutation, otherwise the composer keeps the GIF/text
      // and the user thinks "send didn't work" even though the row inserted).
      if (authorId && authorId !== profile.id) {
        try {
          await db.from('notifications').insert({
            user_id: authorId,
            type: 'comment',
            actor_id: profile.id,
            post_id: postId,
          });
        } catch (notifErr) {
          console.warn('comment notification insert failed (non-fatal):', notifErr);
        }
        try { rewardAccount(); } catch { return saved; }

        // Bump reaction streak with post author (fire and forget)
        try { bumpStreak.mutate(authorId); } catch { /* ignore */ }
      }

      // Run additional AI moderation in background (non-blocking)
      if (filteredText.trim()) {
        moderateContent(filteredText, 'comment', data.id).then(result => {
          try { rewardAccount(); } catch { return; }
          if (result.requires_review) {
            // Update the flag status if moderation catches something
            // Additional moderation is advisory here; only the server may change stored review state.
          }
        }).catch(console.error);
      }

      return saved;
    },
    onSuccess: (comment, { postId }) => {
      try { (comment[COMMENT_REWARD_ACCOUNT] as TokenAccountGuard)(); } catch { return; }
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      rewardComment(comment.id);
      recordChallengeActivity(profile?.id, 'comment');
    },
    onError: (error: Error) => {
      if ('code' in error && error.code === 'account-changed') return;
      const msg = error.message || 'Failed to post comment';
      if (!msg.includes('blocked')) {
        toast.error(msg.includes('permission') ? "Couldn't post comment — try again" : msg);
      }
    },
  });
  type CommentCallbacks = Parameters<typeof mutation.mutate>[1];
  const guardCallbacks = (options: CommentCallbacks): CommentCallbacks => {
    if (!options) return options;
    const guard = tokenAccountGuard(user?.id);
    const current = () => { if (!user || profile?.user_id !== user.id) return false; try { guard(); return true; } catch { return false; } };
    return {
      ...options,
      onSuccess: (...args) => { if (current()) options.onSuccess?.(...args); },
      onError: (...args) => { if (current()) options.onError?.(...args); },
      onSettled: (...args) => { if (current()) options.onSettled?.(...args); },
    };
  };
  return { ...mutation,
    mutate: (input: Parameters<typeof mutation.mutate>[0], options?: CommentCallbacks) => mutation.mutate(input, guardCallbacks(options)),
    mutateAsync: (input: Parameters<typeof mutation.mutateAsync>[0], options?: CommentCallbacks) => mutation.mutateAsync(input, guardCallbacks(options)),
  };
}

type CommentChangeInput = { commentId: string; postId: string; text?: string; expectedRevision?: string | null };

function useChangeComment(action: 'edit' | 'delete') {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ input, guard }: { input: CommentChangeInput; guard: TokenAccountGuard }) => {
      try {
        guard();
        if (!user || !profile || profile.user_id !== user.id) throw new Error('Not authenticated');
        if (action === 'edit') {
          if (typeof input.text !== 'string') throw new Error('Enter a comment before saving.');
          if (containsBlockedContent(input.text).blocked) throw new Error('Your comment contains inappropriate content. Please revise.');
          return await changeComment({ ...input, action, text: filterBlockedContent(input.text) }, profile.id, guard);
        }
        return await changeComment({ ...input, action }, profile.id, guard);
      } catch (error) {
        guard(); // Convert late failures into a silent account-change result.
        throw error;
      }
    },
    onSuccess: ({ postId, guard }) => {
      try { guard(); } catch { return; }
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      if (action === 'delete') queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success(action === 'delete' ? 'Comment deleted' : 'Comment updated');
    },
    onError: (error: Error) => {
      if ('code' in error && error.code === 'account-changed') return;
      toast.error(error.message || 'Could not change comment. Please try again.');
    },
  });
  type Options = Parameters<typeof mutation.mutate>[1];
  // Preserve the public callback input while keeping the dispatch-time guard
  // private. Also covers away-and-back account switches before a response.
  type Callbacks = {
    onSuccess?: (data: Awaited<ReturnType<typeof changeComment>>, input: CommentChangeInput, context: unknown) => void;
    onError?: (error: Error, input: CommentChangeInput, context: unknown) => void;
    onSettled?: (data: Awaited<ReturnType<typeof changeComment>> | undefined, error: Error | null, input: CommentChangeInput, context: unknown) => void;
  };
  const prepare = (input: CommentChangeInput, callbacks?: Callbacks) => {
    const guard = tokenAccountGuard(user?.id);
    const current = () => { try { guard(); return true; } catch { return false; } };
    const options: Options = {
      onSuccess: (data, _variables, context) => { if (current()) callbacks?.onSuccess?.(data, input, context); },
      onError: (error, _variables, context) => { if (current()) callbacks?.onError?.(error, input, context); },
      onSettled: (data, error, _variables, context) => { if (current()) callbacks?.onSettled?.(data, error, input, context); },
    };
    return { variables: { input, guard }, options };
  };
  return {
    ...mutation,
    mutate: (input: CommentChangeInput, callbacks?: Callbacks) => { const request = prepare(input, callbacks); mutation.mutate(request.variables, request.options); },
    mutateAsync: (input: CommentChangeInput, callbacks?: Callbacks) => { const request = prepare(input, callbacks); return mutation.mutateAsync(request.variables, request.options); },
  };
}

export function useDeleteComment() { return useChangeComment('delete'); }
export function useEditComment() { return useChangeComment('edit'); }

export function useLikeComment() {
  const { user, profile } = useAuth(); const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { postId: string; commentId: string; liked: boolean }) => {
      const guard = tokenAccountGuard(user?.id); guard();
      if (!user || profile?.user_id !== user.id) throw new Error('Not authenticated');
      try { return { receipt: await saveCommentChange({ ...input, action: 'like' }, profile.id, guard), guard }; }
      catch (error) { guard(); throw error; }
    },
    onSuccess: ({ receipt, guard }) => { try { guard(); void client.invalidateQueries({ queryKey: ['comments', receipt.postId] }); } catch { /* Old account. */ } },
    onError: (error: Error) => { if (!('code' in error && error.code === 'account-changed')) toast.error(error.message || 'Could not update this reaction.'); },
  });
}
