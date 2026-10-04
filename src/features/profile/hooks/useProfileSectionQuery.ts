import { useQuery } from '@tanstack/react-query';
import { useProfileAccount } from '@/hooks/useProfileAccount';

/** Private sections are memory-only, fresh on mount, and bound to the initiating account epoch. */
export function useProfileSectionQuery<T>(key: readonly unknown[], enabled: boolean, read: (guard: () => void) => Promise<T>) {
  const actor = useProfileAccount();
  const query = useQuery({
    queryKey: ['profile-section', ...key, actor.profile?.id, actor.session.uid, actor.session.epoch],
    queryFn: async ({ signal }) => {
      const guard = () => { actor.guard(); if (signal.aborted) throw Object.assign(new Error('This section closed.'), { code: 'account-changed' }); };
      guard(); const result = await read(guard); guard(); return result;
    },
    enabled: actor.ready && enabled, staleTime: 0, gcTime: 0, retry: false, networkMode: 'always',
    refetchOnMount: 'always', refetchOnWindowFocus: 'always', refetchOnReconnect: 'always',
  });
  const available = actor.ready && enabled && query.isFetchedAfterMount && !query.isError;
  return { ...query, data: available ? query.data : undefined, isLoading: actor.ready && enabled && !query.isError && (!query.isFetchedAfterMount || query.isLoading) };
}
