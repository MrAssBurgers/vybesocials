import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { isOwner } from '@/components/ui/OwnerBadge';

/**
 * Syncs retroactive challenge progress and badges on login for ALL users
 * - Grants badges to users who have already completed the requirements
 * - Ensures owner gets all badges automatically
 */
export function useRetroactiveSync() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (!profile?.id || hasSynced.current) return;

    const syncProgress = async () => {
      try {
        // Sync retroactive challenge progress for this user
        // This grants badges to users who have already completed requirements
        await supabase.rpc('sync_my_challenge_progress');
        
        // If owner, grant all badges
        if (isOwner(profile.username)) {
          await supabase.rpc('check_and_grant_owner_badges');
        }
        
        // Invalidate queries to refresh data with new badges
        queryClient.invalidateQueries({ queryKey: ['challenge-progress'] });
        queryClient.invalidateQueries({ queryKey: ['user-badges', profile.id] });
        queryClient.invalidateQueries({ queryKey: ['user-primary-badge', profile.id] });
        queryClient.invalidateQueries({ queryKey: ['display-style', profile.id] });
        queryClient.invalidateQueries({ queryKey: ['unclaimed-rewards'] });
        queryClient.invalidateQueries({ queryKey: ['user-level'] });
        
        hasSynced.current = true;
        
        if (import.meta.env.DEV) {
          console.log('[RetroactiveSync] Completed sync for user:', profile.username);
        }
      } catch (error) {
        console.error('Failed to sync retroactive progress:', error);
      }
    };

    syncProgress();
  }, [profile?.id, profile?.username, queryClient]);
}
