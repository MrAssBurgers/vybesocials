import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { friendshipPairId } from '@/lib/friendProfilePair';
import type { FriendshipPairRow } from '@/lib/friendProfileClient';

export function useFriendshipPair(otherProfileId: string | undefined) {
  const profileId = useAuthProfileId();
  const pairId =
    profileId && otherProfileId ? friendshipPairId(profileId, otherProfileId) : null;

  return useQuery({
    queryKey: ['friendship-pair', pairId],
    queryFn: async (): Promise<FriendshipPairRow | null> => {
      if (!pairId) return null;
      const { data, error } = await db
        .from('friendship_pairs')
        .select('*')
        .eq('id', pairId)
        .maybeSingle();
      if (error) throw error;
      return (data as FriendshipPairRow | null) ?? null;
    },
    enabled: !!pairId,
    staleTime: 60_000,
  });
}
