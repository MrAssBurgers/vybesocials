import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribes to real-time profile changes and invalidates relevant queries
 * so profile updates (name, avatar, etc.) propagate instantly to all users.
 */
export function useRealtimeProfiles() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('profiles-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          const updatedProfileId = payload.new?.id;
          
          // Invalidate specific profile queries
          if (updatedProfileId) {
            queryClient.invalidateQueries({ queryKey: ['profile', updatedProfileId] });
            queryClient.invalidateQueries({ queryKey: ['user-profile', updatedProfileId] });
          }
          
          // Invalidate general queries that might show this profile
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          queryClient.invalidateQueries({ queryKey: ['messages'] });
          queryClient.invalidateQueries({ queryKey: ['infinite-posts'] });
          queryClient.invalidateQueries({ queryKey: ['posts'] });
          queryClient.invalidateQueries({ queryKey: ['friends'] });
          queryClient.invalidateQueries({ queryKey: ['online-friends'] });
          queryClient.invalidateQueries({ queryKey: ['mutual-friends'] });
          queryClient.invalidateQueries({ queryKey: ['server-members'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
