import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';

/**
 * Hook to get follower count for a profile.
 * Uses polling instead of realtime to reduce connection pool usage.
 */
export function useLiveFollowerCount(profileId: string | undefined) {
  const { data: count = 0 } = useQuery({
    queryKey: ['follower-count', profileId],
    queryFn: async () => {
      if (!profileId) return 0;

      const { count, error } = await db
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', profileId);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!profileId,
    staleTime: 15000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  return count;
}
