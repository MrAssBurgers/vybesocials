import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribes to real-time profile changes and updates cached profile data.
 * IMPORTANT: Only updates the specific profile cache — does NOT mass-invalidate
 * conversations, posts, friends etc. Those caches will pick up profile changes
 * on their next natural refetch.
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
          const updatedProfile = payload.new as any;
          const updatedProfileId = updatedProfile?.id;
          
          if (!updatedProfileId) return;

          // Surgically update ONLY the specific profile caches
          queryClient.setQueryData(['profile', updatedProfileId], (old: any) => 
            old ? { ...old, ...updatedProfile } : old
          );
          queryClient.setQueryData(['user-profile', updatedProfileId], (old: any) => 
            old ? { ...old, ...updatedProfile } : old
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
