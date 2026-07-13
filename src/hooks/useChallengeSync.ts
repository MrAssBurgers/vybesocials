import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { registerChallengeSyncInvalidator } from '@/lib/challengeProgressClient';

const COOLDOWN_MS = 60_000;
const STORAGE_PREFIX = 'vybe:challenge-sync:';

export interface ChallengeSyncResult {
  ok?: boolean;
  skipped_cooldown?: boolean;
  skipped_client_cooldown?: boolean;
  synced?: number;
  synced_at?: string;
  last_sync_at?: string;
  newly_completed?: string[];
}

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function readLastClientSync(userId: string): number {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

function writeLastClientSync(userId: string, ts: number) {
  try {
    localStorage.setItem(storageKey(userId), String(ts));
  } catch {
    // ignore quota / private mode
  }
}

function invalidateChallengeQueries(queryClient: ReturnType<typeof useQueryClient>, profileId?: string, authUserId?: string) {
  queryClient.invalidateQueries({ queryKey: ['challenge-progress'] });
  if (profileId) {
    queryClient.invalidateQueries({ queryKey: ['challenge-progress', profileId] });
  }
  queryClient.invalidateQueries({ queryKey: ['unclaimed-rewards'] });
  if (authUserId) {
    queryClient.invalidateQueries({ queryKey: ['unclaimed-rewards', authUserId] });
    queryClient.invalidateQueries({ queryKey: ['user-level', authUserId] });
  }
  queryClient.invalidateQueries({ queryKey: ['user-badges'] });
  queryClient.invalidateQueries({ queryKey: ['claimed-rewards'] });
}

export async function syncChallengeProgress(options: {
  userId: string;
  force?: boolean;
  queryClient?: ReturnType<typeof useQueryClient>;
  profileId?: string;
  authUserId?: string;
}): Promise<ChallengeSyncResult | null> {
  const { userId, force = false, queryClient, profileId, authUserId } = options;
  if (!userId) return null;

  const now = Date.now();
  const lastClientSync = readLastClientSync(userId);
  if (!force && lastClientSync && now - lastClientSync < COOLDOWN_MS) {
    return { ok: true, skipped_client_cooldown: true };
  }

  const { data, error } = await db.rpc('sync_my_challenge_progress', force ? { force: true } : {});
  if (error) throw error;

  writeLastClientSync(userId, now);

  const result = (data || {}) as ChallengeSyncResult;
  if (queryClient && !result.skipped_cooldown && !result.skipped_client_cooldown) {
    invalidateChallengeQueries(queryClient, profileId, authUserId);
  }

  return result;
}

/**
 * Server-authoritative challenge sync with a 60s per-user cooldown.
 * Triggers: login, app resume, reconnect, challenges screen open, post-activity.
 */
export function useChallengeSync(options?: { syncOnMount?: boolean }) {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const profileId = profile?.id;
  const authUserId = profile?.user_id || user?.id;
  const syncUserId = profileId || authUserId;
  const lastLoginSyncRef = useRef<string | null>(null);
  const syncingRef = useRef(false);

  const runSync = useCallback(async (reason: string, force = false) => {
    if (!syncUserId || syncingRef.current) return null;
    syncingRef.current = true;
    try {
      const result = await syncChallengeProgress({
        userId: syncUserId,
        force,
        queryClient,
        profileId,
        authUserId,
      });
      if (import.meta.env.DEV && result && !result.skipped_cooldown && !result.skipped_client_cooldown) {
        console.debug('[ChallengeSync]', reason, result);
      }
      return result;
    } catch (error) {
      console.warn('[ChallengeSync] failed:', reason, error);
      return null;
    } finally {
      syncingRef.current = false;
    }
  }, [authUserId, profileId, queryClient, syncUserId]);

  // Login sync (once per profile session)
  useEffect(() => {
    if (!profileId || lastLoginSyncRef.current === profileId) return;
    lastLoginSyncRef.current = profileId;
    void runSync('login');
  }, [profileId, runSync]);

  // App resume from background
  useEffect(() => {
    if (!syncUserId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void runSync('resume');
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [runSync, syncUserId]);

  // Reconnect after offline
  useEffect(() => {
    if (!syncUserId) return;
    const onOnline = () => void runSync('reconnect');
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [runSync, syncUserId]);

  // Periodic auto-sync while the app is in the foreground (respects cooldown).
  useEffect(() => {
    if (!syncUserId) return;
    const tick = () => {
      if (document.visibilityState === 'visible') {
        void runSync('interval');
      }
    };
    const id = window.setInterval(tick, COOLDOWN_MS);
    return () => window.clearInterval(id);
  }, [runSync, syncUserId]);

  // Invalidate challenge queries when activity-triggered sync completes elsewhere.
  useEffect(() => {
    const invalidate = () => invalidateChallengeQueries(queryClient, profileId, authUserId);
    registerChallengeSyncInvalidator(invalidate);
    return () => registerChallengeSyncInvalidator(null);
  }, [authUserId, profileId, queryClient]);

  // Optional mount trigger (Challenges screen)
  useEffect(() => {
    if (!options?.syncOnMount || !syncUserId) return;
    void runSync('challenges-open');
  }, [options?.syncOnMount, runSync, syncUserId]);

  return {
    syncChallenges: runSync,
    syncAfterActivity: () => runSync('activity'),
  };
}
