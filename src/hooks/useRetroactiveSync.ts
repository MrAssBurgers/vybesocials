import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { isOwner } from '@/components/ui/OwnerBadge';
import { runWhenIdle } from '@/lib/performanceConfig';

/**
 * Syncs retroactive challenge progress and badges on login for ALL users.
 * Deferred to idle time to avoid blocking initial render.
 */
export function useRetroactiveSync() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const lastSyncedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (profile?.id !== lastSyncedUserId.current) {
      lastSyncedUserId.current = null;
    }
    
    if (!profile?.id || lastSyncedUserId.current === profile.id) return;

    // Defer sync to idle time - not critical for initial render
    const idleId = runWhenIdle(async () => {
      try {
        const { error: syncError } = await supabase.rpc('sync_my_challenge_progress');
        if (syncError) {
          console.error('[RetroactiveSync] Challenge sync error:', syncError);
        }
        
        if (isOwner(profile.username)) {
          const { error: ownerError } = await supabase.rpc('check_and_grant_owner_badges');
          if (ownerError) {
            console.error('[RetroactiveSync] Owner badge error:', ownerError);
          }
        }
        
        // Invalidate badge queries after sync
        queryClient.invalidateQueries({ queryKey: ['challenge-progress'] });
        queryClient.invalidateQueries({ queryKey: ['user-badges'] });
        queryClient.invalidateQueries({ queryKey: ['user-primary-badge'] });
        queryClient.invalidateQueries({ queryKey: ['user-level'] });
        
        lastSyncedUserId.current = profile.id;
      } catch (error) {
        console.error('[RetroactiveSync] Failed:', error);
      }
    }, 5000); // 5s timeout - will run sooner if idle

    return () => {
      if (typeof idleId === 'number') {
        if ('cancelIdleCallback' in window) {
          cancelIdleCallback(idleId);
        } else {
          clearTimeout(idleId);
        }
      }
    };
  }, [profile?.id, profile?.username, queryClient]);
}
