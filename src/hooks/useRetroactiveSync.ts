import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { isOwner } from '@/components/ui/OwnerBadge';

/**
 * Syncs retroactive challenge progress and grants owner badges on login
 */
export function useRetroactiveSync() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (!profile?.id || hasSynced.current) return;

    const syncProgress = async () => {
      try {
        // Sync retroactive challenge progress
        await supabase.rpc('sync_my_challenge_progress');
        
        // If owner, grant all badges
        if (isOwner(profile.username)) {
          await supabase.rpc('check_and_grant_owner_badges');
        }
        
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['challenge-progress'] });
        queryClient.invalidateQueries({ queryKey: ['user-badges'] });
        queryClient.invalidateQueries({ queryKey: ['unclaimed-rewards'] });
        queryClient.invalidateQueries({ queryKey: ['user-level'] });
        
        hasSynced.current = true;
      } catch (error) {
        console.error('Failed to sync retroactive progress:', error);
      }
    };

    syncProgress();
  }, [profile?.id, profile?.username, queryClient]);
}
