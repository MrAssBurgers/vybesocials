import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { isOwner } from '@/components/ui/OwnerBadge';
import { cancelIdle, runWhenIdle } from '@/lib/performanceConfig';
import { syncChallengeProgress } from '@/hooks/useChallengeSync';
import { db } from '@/lib/firebase';

/**
 * Syncs retroactive challenge progress and badges on login for ALL users.
 * Deferred to idle time to avoid blocking initial render.
 */
export function useRetroactiveSync() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const lastSyncedUserId = useRef<string | null>(null);
  const authUserId = profile?.user_id || user?.id;

  useEffect(() => {
    if (profile?.id !== lastSyncedUserId.current) {
      lastSyncedUserId.current = null;
    }
    
    if (!profile?.id || lastSyncedUserId.current === profile.id) return;

    const idleId = runWhenIdle(async () => {
      try {
        await syncChallengeProgress({
          userId: profile.id,
          queryClient,
          profileId: profile.id,
          authUserId,
        });
        
        if (isOwner(profile.username)) {
          const { error: ownerError } = await db.rpc('check_and_grant_owner_badges');
          if (ownerError) {
            console.error('[RetroactiveSync] Owner badge error:', ownerError);
          }
        }
        
        lastSyncedUserId.current = profile.id;
      } catch (error) {
        console.error('[RetroactiveSync] Failed:', error);
      }
    }, 10000);

    return () => {
      if (typeof idleId === 'number') {
        cancelIdle(idleId);
      }
    };
  }, [authUserId, profile?.id, profile?.username, queryClient]);
}
