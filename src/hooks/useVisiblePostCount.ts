import { useQuery } from '@tanstack/react-query';
import { usePostReadView } from './usePostReadView';
import { readSocialPostSummary } from '@/lib/socialPostListService';
import { withPostReadDeadline } from '@/lib/postReadDeadline';

export function useVisiblePostCount(profileId: string | undefined, enabled = true) {
  const view = usePostReadView(enabled && !!profileId);
  const query = useQuery({
    queryKey: ['profile-visible-post-count', ...view.key, profileId],
    enabled: view.active && !!profileId,
    queryFn: ({ signal }) => withPostReadDeadline(current => readSocialPostSummary({ expectedOwnerUid: view.account.session.uid!, expectedProfileId: view.account.profile!.id, scope: 'profile', targetId: profileId! }, current), () => view.guard(signal), signal),
    staleTime: 0, gcTime: 0, retry: false, refetchOnMount: 'always', refetchInterval: 20000, refetchOnWindowFocus: true, placeholderData: undefined,
  });
  const current = view.active && query.isSuccess && !query.isPlaceholderData && query.data.leaseUntil > view.now && !query.isError;
  return { count: current ? query.data.count : null, exact: current && !query.data.hasMore,
    label: current ? `${query.data.count}${query.data.hasMore ? '+' : ''}` : '—', isError: query.isError, retry: query.refetch };
}
