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

          // If username, display_name, or avatar changed, invalidate all caches
          // that embed profile data (posts, comments, conversations, friends, etc.)
          const usernameChanged = oldProfile?.username !== updatedProfile?.username;
          const displayNameChanged = oldProfile?.display_name !== updatedProfile?.display_name;
          const avatarChanged = oldProfile?.avatar_url !== updatedProfile?.avatar_url;

          if (usernameChanged || displayNameChanged || avatarChanged) {
            queryClient.invalidateQueries({ queryKey: ['posts'] });
            queryClient.invalidateQueries({ queryKey: ['comments'] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['friends'] });
            queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
            queryClient.invalidateQueries({ queryKey: ['followers'] });
            queryClient.invalidateQueries({ queryKey: ['following'] });
            queryClient.invalidateQueries({ queryKey: ['invite-leaderboard'] });
            queryClient.invalidateQueries({ queryKey: ['invite-stats'] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
