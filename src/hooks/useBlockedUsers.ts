import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';

/**
 * Returns the set of profile IDs the current user has blocked.
 * Used to client-filter feeds since several feed RPCs don't accept a viewer ID.
 */
export function useBlockedUserIds() {
  const profileId = useAuthProfileId();

  const { data } = useQuery({
    queryKey: ['blocked-user-ids', profileId],
    queryFn: async (): Promise<string[]> => {
      if (!profileId) return [];
      const { data, error } = await db
        .from('blocked_users')
        .select('blocked_id')
        .eq('blocker_id', profileId);
      if (error) {
        console.warn('[useBlockedUserIds] failed', error);
        return [];
      }
      return (data || []).map((r: any) => r.blocked_id).filter(Boolean);
    },
    enabled: !!profileId,
    networkMode: 'always',
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  return data || [];
}
