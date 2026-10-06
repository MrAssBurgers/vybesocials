import { communityReadPhaseCurrent, useCommunityReadPhase } from './useCommunityReadPhase';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { communityAccountLease, isCommunitySessionCurrent } from '@/lib/communityService';
import { useCommunitySession } from './useCommunitySession';

/** Private reads need fresh authority; previous successes are not access grants. */
export function useCommunityQuery<T>(options: Omit<UseQueryOptions<T, Error>, 'queryFn'> & { queryFn: () => Promise<T> }) {
  const { session, uid, ready } = useCommunitySession();
  const phase = useCommunityReadPhase();
  const accountGuard = communityAccountLease(uid, session);
  const guard = () => {
    accountGuard();
    if (!communityReadPhaseCurrent(phase)) throw Object.assign(new Error('Community reads resume when the app is foregrounded.'), { code: 'community-paused' });
  };
  const query = useQuery<T, Error>({
    ...options,
    queryKey: [...options.queryKey, session.uid, session.epoch, phase.generation],
    queryFn: async () => { guard(); const value = await options.queryFn(); guard(); return value; },
    enabled: ready && phase.foreground && options.enabled !== false,
    placeholderData: undefined,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    networkMode: 'always',
    refetchInterval: 15_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
  return { ...query, data: ready && communityReadPhaseCurrent(phase) && isCommunitySessionCurrent(session) && !query.isError ? query.data : undefined };
}
