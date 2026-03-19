import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Subscribes to real-time profile changes and updates cached profile data.
 * Debounces broad invalidations to prevent cascade refetching when multiple
 * profile updates arrive in quick succession (e.g. batch imports, migrations).
 */
export function useRealtimeProfiles() {
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          const oldProfile = payload.old as any;
          const updatedProfileId = updatedProfile?.id;
          
          if (!updatedProfileId) return;

          // Surgically update the specific profile caches
          queryClient.setQueryData(['profile', updatedProfileId], (old: any) => 
            old ? { ...old, ...updatedProfile } : old
          );
          queryClient.setQueryData(['user-profile', updatedProfileId], (old: any) => 
            old ? { ...old, ...updatedProfile } : old
          );

          // If username, display_name, or avatar changed, debounce broad invalidation
          const usernameChanged = oldProfile?.username !== updatedProfile?.username;
          const displayNameChanged = oldProfile?.display_name !== updatedProfile?.display_name;
          const avatarChanged = oldProfile?.avatar_url !== updatedProfile?.avatar_url;

          if (usernameChanged || displayNameChanged || avatarChanged) {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: ['posts'] });
              queryClient.invalidateQueries({ queryKey: ['comments'] });
              queryClient.invalidateQueries({ queryKey: ['conversations'] });
              queryClient.invalidateQueries({ queryKey: ['friends'] });
              queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
              queryClient.invalidateQueries({ queryKey: ['followers'] });
              queryClient.invalidateQueries({ queryKey: ['following'] });
            }, 500);
          }
        }
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
