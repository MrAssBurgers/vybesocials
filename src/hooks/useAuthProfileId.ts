import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { resolveSessionProfileId, syncSessionProfileId } from '@/lib/resolveSessionProfileId';
import { useReportAccountSession } from './useReportAccountSession';

/** Profile id for queries during auth hydration (live profile, disk cache, or session lookup). */
export function useAuthProfileId(): string | undefined {
  const { profile, user } = useAuth();
  const session = useReportAccountSession();
  const ready = !!user?.id && session.uid === user.id;
  const ownedLiveId = ready && profile?.user_id === user.id ? profile.id : undefined;
  const cached = ready ? ownedLiveId ?? syncSessionProfileId() : undefined;

  const resolveQuery = useQuery({
    queryKey: ['session-profile-id', session.uid, session.epoch],
    queryFn: async () => {
      const id = await resolveSessionProfileId(ownedLiveId);
      if (!id) throw new Error('Your profile could not be loaded. Please retry.');
      return { uid: session.uid, epoch: session.epoch, id };
    },
    enabled: ready && !cached,
    placeholderData: undefined,
    initialData: undefined,
    staleTime: 60_000,
    gcTime: 0,
    refetchOnMount: 'always',
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    networkMode: 'always',
  });

  if (!ready) return undefined;
  if (cached) return cached;
  const resolved = resolveQuery.data;
  if (!resolveQuery.isPlaceholderData && resolved?.uid === session.uid && resolved.epoch === session.epoch && !resolveQuery.isError) return resolved.id ?? cached;
  return cached;
}
