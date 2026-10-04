import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

/**
 * Hook to get member count for a server.
 * Uses polling instead of realtime to reduce connection pool usage.
 */
export function useLiveMemberCount(serverId: string | undefined) {
  const accountId = useAuth().user?.id;
  const { data: count = 0 } = useQuery({
    queryKey: ['server-member-count', serverId, accountId],
    queryFn: async () => {
      if (!serverId) return 0;

      const { data, error } = await db
        .from('servers')
        .select('member_count')
        .eq('id', serverId).single();

      if (error) throw error;
      return Number(data?.member_count) || 0;
    },
    enabled: !!serverId && !!accountId,
    staleTime: 15000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  return count;
}

/**
 * Hook to get all server member counts.
 * Uses polling instead of per-server realtime channels.
 */
export function useAllServerMemberCounts(serverIds: string[]) {
  const accountId = useAuth().user?.id;
  const stableServerIds = serverIds.join(',');

  const { data: counts = {} } = useQuery({
    queryKey: ['all-server-member-counts', stableServerIds, accountId],
    queryFn: async () => {
      if (serverIds.length === 0) return {};

      const countsMap: Record<string, number> = {};
      
      const results = await Promise.all(
        serverIds.map(async (serverId) => {
          const { data, error } = await db
            .from('servers')
            .select('member_count')
            .eq('id', serverId).single();
          
          if (error) {
            console.error('Error fetching member count for server:', serverId, error);
            return { serverId, count: 0 };
          }
          
          return { serverId, count: Number(data?.member_count) || 0 };
        })
      );
      
      results.forEach(({ serverId, count }) => {
        countsMap[serverId] = count;
      });

      return countsMap;
    },
    enabled: serverIds.length > 0 && !!accountId,
    staleTime: 15000,
    refetchInterval: 30000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  return counts;
}
