import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { communityAccountLease, isCommunitySessionCurrent } from '@/lib/communityService';
import { useCommunitySession } from './useCommunitySession';

/** Private reads need fresh authority; previous successes are not access grants. */
export function useCommunityQuery<T>(options: Omit<UseQueryOptions<T, Error>, 'queryFn'> & { queryFn: () => Promise<T> }) {
  const { session, uid, ready } = useCommunitySession();
  const guard = communityAccountLease(uid, session);
  const query = useQuery<T, Error>({
    ...options,
    queryKey: [...options.queryKey, session.uid, session.epoch],
    queryFn: async () => { guard(); const value = await options.queryFn(); guard(); return value; },
    enabled: ready && options.enabled !== false,
    placeholderData: undefined,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    networkMode: 'always',
    refetchInterval: 15_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
  return { ...query, data: ready && isCommunitySessionCurrent(session) && !query.isError ? query.data : undefined };
}
