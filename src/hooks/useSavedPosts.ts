import { useSocialPostList } from './useSocialPostList';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useProfileAccount } from './useProfileAccount';
import { db } from '@/lib/firebase';

export function useSavedPosts(enabled = true) {
  return useSocialPostList({ scope: 'saved' }, enabled);
}

export function useRemoveSavedPost() {
  const account = useProfileAccount(), client = useQueryClient();
  return useMutation({
    mutationKey: ['remove-saved-post', account.session.uid, account.session.epoch],
    mutationFn: async (postId: string) => {
      account.guard();
      for (const alias of new Set([account.user!.id, account.profile!.id])) {
        account.guard();
        const result = await db.from('bookmarks').delete().eq('user_id', alias).eq('post_id', postId);
        account.guard(); if (result.error) throw result.error;
      }
    },
    onSuccess: () => { try { account.guard(); } catch { return; } void client.invalidateQueries({ queryKey: ['social-post-list'] }); },
  });
}
