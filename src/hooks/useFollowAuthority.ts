import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useProfileAccount } from '@/hooks/useProfileAccount';
import { readFollowList, readFollowState, writeFollow, type FollowWrite } from '@/lib/followService';
import { recordChallengeActivity } from '@/lib/challengeProgressClient';

export function useFollowAuthority(targetId?: string) {
  const account = useProfileAccount(); const client = useQueryClient();
  const actor = { expectedOwnerUid: account.user?.id || '', expectedProfileId: account.profile?.id || '' };
  const query = useQuery({ queryKey: ['follow-authority', account.session.uid, account.session.epoch, actor.expectedProfileId, targetId],
    enabled: account.ready && !!targetId && targetId !== actor.expectedProfileId, staleTime: 0, gcTime: 0,
    refetchOnMount: 'always', refetchInterval: 15000,
    queryFn: () => readFollowState({ ...actor, targetId: targetId! }, account.guard) });
  const mutation = useMutation({ mutationFn: (input: FollowWrite) => writeFollow({ ...actor, ...input }, account.guard),
    onSuccess: (result, input) => { account.guard(); for (const key of ['follow-authority', 'follow-management', 'profile', 'hover-profile', 'following-posts', 'follower-count']) void client.invalidateQueries({ queryKey: [key] });
      if (input.action === 'request' && result.state === 'following' && result.revision > input.revision) void recordChallengeActivity(actor.expectedProfileId, 'follow');
    } });
  return { ...account, query, mutation };
}
export function useFollowManagement(view: 'requests' | 'followers') {
  const account = useProfileAccount();
  const actor = { expectedOwnerUid: account.user?.id || '', expectedProfileId: account.profile?.id || '' };
  return useInfiniteQuery({ queryKey: ['follow-management', account.session.uid, account.session.epoch, actor.expectedProfileId, view],
    enabled: account.ready, staleTime: 0, gcTime: 0, refetchOnMount: 'always', refetchInterval: 15000,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => readFollowList({ ...actor, view, ...(pageParam ? { cursor: pageParam } : {}) }, account.guard),
    getNextPageParam: page => page.nextCursor ?? undefined });
}
