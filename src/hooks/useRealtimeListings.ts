import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribes to real-time listing changes (INSERT, UPDATE, DELETE)
 * so marketplace updates appear instantly for all users.
 */
export function useRealtimeListings() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('listings-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'listings',
        },
        (payload) => {
          // Invalidate all listing queries to refresh data
          queryClient.invalidateQueries({ queryKey: ['listings'] });
          queryClient.invalidateQueries({ queryKey: ['my-listings'] });
          
          // For specific listing updates/deletes
          if (payload.old && 'id' in payload.old) {
            queryClient.invalidateQueries({ queryKey: ['listing', payload.old.id] });
          }
          if (payload.new && 'id' in payload.new) {
            queryClient.invalidateQueries({ queryKey: ['listing', payload.new.id] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
