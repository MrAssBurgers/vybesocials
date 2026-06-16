import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';

/**
 * Hook to get member count for a server.
 * Uses polling instead of realtime to reduce connection pool usage.
 */
export function useLiveMemberCount(serverId: string | undefined) {
  const { data: count = 0 } = useQuery({
    queryKey: ['server-member-count', serverId],
    queryFn: async () => {
      if (!serverId) return 0;

      const { count, error } = await db
        .from('server_members')
        .select('*', { count: 'exact', head: true })
        .eq('server_id', serverId);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!serverId,
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
  const stableServerIds = serverIds.join(',');

  const { data: counts = {} } = useQuery({
    queryKey: ['all-server-member-counts', stableServerIds],
    queryFn: async () => {
      if (serverIds.length === 0) return {};

      const countsMap: Record<string, number> = {};
      
      const results = await Promise.all(
        serverIds.map(async (serverId) => {
          const { count, error } = await db
            .from('server_members')
            .select('*', { count: 'exact', head: true })
            .eq('server_id', serverId);
          
          if (error) {
            console.error('Error fetching member count for server:', serverId, error);
            return { serverId, count: 0 };
          }
          
          return { serverId, count: count || 0 };
        })
      );
      
      results.forEach(({ serverId, count }) => {
        countsMap[serverId] = count;
      });

      return countsMap;
    },
    enabled: serverIds.length > 0,
    staleTime: 15000,
    refetchInterval: 30000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  return counts;
}
