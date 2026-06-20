import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { resolveSessionProfileId, syncSessionProfileId } from '@/lib/resolveSessionProfileId';

/** Profile id for queries during auth hydration (live profile, disk cache, or session lookup). */
export function useAuthProfileId(): string | undefined {
  const { profile, user } = useAuth();
  const cached = syncSessionProfileId(profile?.id);
  // Migrated users: profile.id must be legacy UUID, not Firebase auth uid.
  const suspectAuthUidAsProfileId = !!(
    user?.id &&
    (cached === user.id || (profile?.id === user.id && profile?.user_id === user.id))
  );

  const resolveQuery = useQuery({
    queryKey: ['session-profile-id', user?.id],
    queryFn: () => resolveSessionProfileId(profile?.id),
    enabled: !!user?.id && (!cached || suspectAuthUidAsProfileId),
    staleTime: 60_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    networkMode: 'always',
  });

  // Prefer resolved legacy UUID when available; never block social/search while resolving.
  if (resolveQuery.data) return resolveQuery.data;
  return cached ?? profile?.id ?? undefined;
}
