import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to get live member count for a server with realtime updates
 */
export function useLiveMemberCount(serverId: string | undefined) {
  const queryClient = useQueryClient();
  const [liveCount, setLiveCount] = useState<number | null>(null);

  const { data: initialCount } = useQuery({
    queryKey: ['server-member-count', serverId],
    queryFn: async () => {
      if (!serverId) return 0;

      const { count, error } = await supabase
        .from('server_members')
        .select('*', { count: 'exact', head: true })
        .eq('server_id', serverId);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!serverId,
  });

  // Set up realtime subscription
  useEffect(() => {
    if (!serverId) return;

    const channel = supabase
      .channel(`server-members-count:${serverId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'server_members',
          filter: `server_id=eq.${serverId}`,
        },
        async () => {
          // Refetch count on any change
          const { count } = await supabase
            .from('server_members')
            .select('*', { count: 'exact', head: true })
            .eq('server_id', serverId);
          
          setLiveCount(count || 0);
          queryClient.invalidateQueries({ queryKey: ['server-member-count', serverId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [serverId, queryClient]);

  return liveCount ?? initialCount ?? 0;
}

/**
 * Hook to get all server member counts with realtime updates
 */
export function useAllServerMemberCounts(serverIds: string[]) {
  const queryClient = useQueryClient();

  // Initial fetch with proper data return
  const { data: counts = {} } = useQuery({
    queryKey: ['all-server-member-counts', serverIds],
    queryFn: async () => {
      if (serverIds.length === 0) return {};

      const countsMap: Record<string, number> = {};
      
      // Fetch counts for all servers in parallel
      await Promise.all(
        serverIds.map(async (serverId) => {
          const { count } = await supabase
            .from('server_members')
            .select('*', { count: 'exact', head: true })
            .eq('server_id', serverId);
          
          countsMap[serverId] = count || 0;
        })
      );

      return countsMap;
    },
    enabled: serverIds.length > 0,
    staleTime: 1000 * 30, // Cache for 30 seconds
  });

  // Set up realtime subscriptions for all servers
  useEffect(() => {
    if (serverIds.length === 0) return;

    const channels = serverIds.map((serverId) => {
      return supabase
        .channel(`server-members-count-all:${serverId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'server_members',
            filter: `server_id=eq.${serverId}`,
          },
          () => {
            // Invalidate query to refetch on any change
            queryClient.invalidateQueries({ queryKey: ['all-server-member-counts', serverIds] });
          }
        )
        .subscribe();
    });

    return () => {
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [serverIds.join(','), queryClient]);

  return counts;
}
