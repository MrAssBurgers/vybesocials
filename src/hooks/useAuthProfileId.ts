import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { resolveSessionProfileId, syncSessionProfileId } from '@/lib/resolveSessionProfileId';

/** Profile id for queries during auth hydration (live profile, disk cache, or session lookup). */
export function useAuthProfileId(): string | undefined {
  const { profile, user } = useAuth();
  const cached = syncSessionProfileId(profile?.id);

  const resolveQuery = useQuery({
    queryKey: ['session-profile-id', user?.id],
    queryFn: () => resolveSessionProfileId(profile?.id),
    enabled: !!user?.id && !cached,
    staleTime: 60_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    networkMode: 'always',
  });

  return cached ?? resolveQuery.data ?? undefined;
}
