import { useQuery } from '@tanstack/react-query';
import { invokeFunction } from '@/lib/firebase/functionsService';
import type { InboxRelationshipProjection } from '@/lib/relationship/relationshipTypes';

export interface RelationshipStateResponse extends InboxRelationshipProjection {
  ok?: boolean;
  milestone?: Record<string, unknown> | null;
  streak?: Record<string, unknown> | null;
}

export function useRelationshipState(
  friendId?: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ['relationship-state', friendId],
    queryFn: async (): Promise<RelationshipStateResponse | null> => {
      if (!friendId) return null;
      const res = await invokeFunction<RelationshipStateResponse>('getRelationshipState', {
        friend_id: friendId,
      });
      if (res.error) throw new Error(res.error.message);
      return res.data ?? null;
    },
    enabled: Boolean(friendId) && enabled,
    staleTime: 30_000,
  });
}
