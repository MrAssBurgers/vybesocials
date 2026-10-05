import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { documentRef, onSnapshot } from '@/lib/firebase/firestoreDb';
import { friendshipPairId } from '@/lib/friendProfilePair';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';

/** Realtime invalidation for friendship pair docs; location grants use checked expiring reads. */
export function useFriendProfileRealtime(otherProfileId: string | undefined) {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();
  const pairId =
    profileId && otherProfileId ? friendshipPairId(profileId, otherProfileId) : null;

  useEffect(() => {
    if (!pairId) return;

    const unsubPair = onSnapshot(documentRef('friendship_pairs', pairId), () => {
      queryClient.invalidateQueries({ queryKey: ['friendship-pair', pairId] });
    });

    return () => {
      unsubPair();
    };
  }, [pairId, queryClient]);
}
