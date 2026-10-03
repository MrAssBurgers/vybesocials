import { db } from '@/lib/firebase';

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
let lastIncrementAt = 0;
const INCREMENT_GAP_MS = 20_000;

/**
 * Record challenge activity. The server recounts progress itself, so a second
 * full sync right after increment only adds another cold function call.
 */
export function recordChallengeActivity(
  _profileId: string | undefined,
  requirementType: string,
  increment = 1,
): void {
  if (!requirementType) return;
  const now = Date.now();
  if (incrementInflight || now - lastIncrementAt < INCREMENT_GAP_MS) return;
  lastIncrementAt = now;
  incrementInflight = db.rpc('increment_challenge_progress', {
    p_requirement_type: requirementType,
    p_increment: increment,
  }).then(({ error }) => {
    if (error && import.meta.env.DEV) {
      console.warn('[challenges] increment failed:', requirementType, error.message || error);
    }
    if (!error) syncInvalidator?.();
  }).finally(() => {
    incrementInflight = null;
  });
}
