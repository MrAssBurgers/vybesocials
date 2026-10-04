import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { listVisibleStories } from '@/lib/storyReadService';
import { isStorySessionCurrent } from '@/lib/storiesQueryKey';
import { useStoryAccount } from './useStoryAccount';

/** Viewer props carry IDs, not a reusable audience grant. */
export function useVisibleStory(storyId: string | undefined) {
  const { user, profile, session, ready, guard } = useStoryAccount();
  const query = useQuery({
    queryKey: ['visible-story', storyId, profile?.id, session.uid, session.epoch],
    queryFn: async () => {
      guard();
      const page = await listVisibleStories({ expectedOwnerUid: user!.id, expectedProfileId: profile!.id, storyIds: [storyId!] }, guard);
      return page.stories.find(row => row.id === storyId && Date.parse(row.expires_at) > Date.now()) ?? null;
    },
    enabled: ready && !!storyId, retry: false, gcTime: 0, staleTime: 0, networkMode: 'always',
    placeholderData: undefined, refetchInterval: 15_000, refetchOnMount: 'always', refetchOnWindowFocus: 'always', refetchOnReconnect: 'always',
  });
  useEffect(() => {
    if (!ready || !storyId) return;
    const resume = () => { if (isStorySessionCurrent(session)) void query.refetch(); };
    window.addEventListener('app-resumed', resume);
    return () => window.removeEventListener('app-resumed', resume);
  }, [ready, storyId, session, query.refetch]);
  const current = ready && isStorySessionCurrent(session);
  return { ...query, data: current && !query.isError && query.isFetchedAfterMount ? query.data : undefined,
    isLoading: !current || query.isLoading || (!query.isFetchedAfterMount && !query.isError) };
}
