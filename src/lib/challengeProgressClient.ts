import { db, getFirebaseAuth } from '@/lib/firebase';
import { claimChallengeRewardOnce } from '@/lib/challengeClaimOnce';

type SyncInvalidator = () => void;
let syncInvalidator: SyncInvalidator | null = null;

/** Registered by useChallengeSync so activity-triggered sync refreshes UI. */
export function registerChallengeSyncInvalidator(fn: SyncInvalidator | null) {
  syncInvalidator = fn;
}

/** Fire-and-forget bump for active challenges matching a requirement type. */
export function bumpChallengeProgress(requirementType: string, increment = 1): void {
  if (!requirementType) return;
  void db.rpc('increment_challenge_progress', {
    p_requirement_type: requirementType,
    p_increment: increment,
  }).then(({ error }) => {
    if (error && import.meta.env.DEV) {
      console.warn('[challenges] increment failed:', requirementType, error.message || error);
    }
  });
}

/** Map post composer type to challenge requirement_type. */
export function challengeTypeForPost(postType: string): 'post' | 'clip' | 'story' {
  if (postType === 'short' || postType === 'video') return 'clip';
  if (postType === 'story') return 'story';
  return 'post';
}

/** Fire-and-forget sync after user activity (respects client cooldown). */
export function syncChallengeProgressAfterActivity(userId: string | undefined): void {
  if (!userId) return;
  void import('@/hooks/useChallengeSync').then(({ syncChallengeProgress }) =>
    syncChallengeProgress({ userId })
      .then((result) => {
        if (result?.newly_completed?.length) {
          syncInvalidator?.();
        }
      })
      .catch(() => {}),
  );
}

let incrementInflight: Promise<unknown> | null = null;
let incrementQueued: { profileId: string | undefined; requirementType: string; increment: number } | null = null;

function claimFreshRewards(data: unknown) {
  const uid = getFirebaseAuth()?.currentUser?.uid;
  const completed = data && typeof data === 'object' && Array.isArray((data as { newly_completed?: unknown }).newly_completed)
    ? (data as { newly_completed: unknown[] }).newly_completed
    : [];
  if (!uid) return;
  for (const challengeId of completed) {
    if (typeof challengeId !== 'string' || !challengeId || challengeId.includes('/')) continue;
    void claimChallengeRewardOnce(`${uid}_${challengeId}`, 0, challengeId);
  }
}

/**
 * Record challenge activity. The server recounts progress itself.
 * A follow-up is kept if another action lands while one sync is in flight.
 */
export function recordChallengeActivity(
  _profileId: string | undefined,
  requirementType: string,
  increment = 1,
): void {
  if (!requirementType) return;
  if (incrementInflight) {
    incrementQueued = { profileId: _profileId, requirementType, increment };
    return;
  }
  incrementInflight = db.rpc('increment_challenge_progress', {
    p_requirement_type: requirementType,
    p_increment: increment,
  }).then(({ data, error }) => {
    if (error && import.meta.env.DEV) {
      console.warn('[challenges] increment failed:', requirementType, error.message || error);
    }
    if (!error) {
      syncInvalidator?.();
      claimFreshRewards(data);
    }
  }).finally(() => {
    incrementInflight = null;
    const next = incrementQueued;
    incrementQueued = null;
    if (next) recordChallengeActivity(next.profileId, next.requirementType, next.increment);
  });
}
