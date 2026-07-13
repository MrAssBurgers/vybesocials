import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { ensureArray } from '@/lib/persistedCollections';

/** Set of close-friend profile IDs for the signed-in user. */
export function useCloseFriendIds(): {
  ids: Set<string>;
  isLoading: boolean;
  isFetched: boolean;
} {
  const profileId = useAuthProfileId();
  const { data, isLoading, isFetched } = useQuery({
    queryKey: ['close-friend-ids', profileId],
    queryFn: async () => {
      if (!profileId) return [] as string[];
      const { data: rows, error } = await db
        .from('close_friends')
        .select('friend_id')
        .eq('user_id', profileId);
      if (error) {
        console.warn('[useCloseFriendIds]', error.message);
        return [] as string[];
      }
      return (rows || [])
        .map((row) => String((row as { friend_id?: string }).friend_id || ''))
        .filter(Boolean);
    },
    enabled: Boolean(profileId),
    staleTime: 60_000,
  });

  const ids = useMemo(
    () => new Set(ensureArray<string>(data).map(String).filter(Boolean)),
    [data],
  );

  return { ids, isLoading, isFetched };
}
