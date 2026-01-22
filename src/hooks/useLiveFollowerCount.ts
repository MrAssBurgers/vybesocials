import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to get live follower count for a profile with realtime updates
 */
export function useLiveFollowerCount(profileId: string | undefined) {
  const queryClient = useQueryClient();
  const [liveCount, setLiveCount] = useState<number | null>(null);

  const { data: initialCount } = useQuery({
    queryKey: ['follower-count', profileId],
    queryFn: async () => {
      if (!profileId) return 0;

      const { count, error } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', profileId);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!profileId,
  });

  // Set up realtime subscription
  useEffect(() => {
    if (!profileId) return;

    const channel = supabase
      .channel(`follower-count:${profileId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'follows',
          filter: `following_id=eq.${profileId}`,
        },
        async () => {
          // Refetch count on any change
          const { count } = await supabase
            .from('follows')
            .select('*', { count: 'exact', head: true })
            .eq('following_id', profileId);
          
          setLiveCount(count || 0);
          queryClient.invalidateQueries({ queryKey: ['follower-count', profileId] });
          queryClient.invalidateQueries({ queryKey: ['profile'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileId, queryClient]);

  return liveCount ?? initialCount ?? 0;
}
