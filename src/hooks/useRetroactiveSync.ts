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
  const lastSyncedUserId = useRef<string | null>(null);

  useEffect(() => {
    // Reset sync flag if user changed
    if (profile?.id !== lastSyncedUserId.current) {
      lastSyncedUserId.current = null;
    }
    
    if (!profile?.id || lastSyncedUserId.current === profile.id) return;

    const syncProgress = async () => {
      try {
        console.log('[RetroactiveSync] Starting sync for:', profile.username);
        
        // Sync retroactive challenge progress for this user
        const { error: syncError } = await supabase.rpc('sync_my_challenge_progress');
        if (syncError) {
          console.error('[RetroactiveSync] Challenge sync error:', syncError);
        } else {
          console.log('[RetroactiveSync] Challenge progress synced');
        }
        
        // If owner, grant all badges
        if (isOwner(profile.username)) {
          console.log('[RetroactiveSync] Granting owner badges...');
          const { error: ownerError } = await supabase.rpc('check_and_grant_owner_badges');
          if (ownerError) {
            console.error('[RetroactiveSync] Owner badge error:', ownerError);
          } else {
            console.log('[RetroactiveSync] Owner badges granted');
          }
        }
        
        // Invalidate all badge/display queries to refresh data
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['challenge-progress'] }),
          queryClient.invalidateQueries({ queryKey: ['user-badges'] }),
          queryClient.invalidateQueries({ queryKey: ['user-primary-badge'] }),
          queryClient.invalidateQueries({ queryKey: ['display-style'] }),
          queryClient.invalidateQueries({ queryKey: ['unclaimed-rewards'] }),
          queryClient.invalidateQueries({ queryKey: ['user-level'] }),
        ]);
        
        lastSyncedUserId.current = profile.id;
        console.log('[RetroactiveSync] Completed sync for:', profile.username);
      } catch (error) {
        console.error('[RetroactiveSync] Failed:', error);
      }
    };

    syncProgress();
  }, [profile?.id, profile?.username, queryClient]);
}
