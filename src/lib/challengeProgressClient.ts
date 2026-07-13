import { db } from '@/lib/firebase';

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
    syncChallengeProgress({ userId }).catch(() => {}),
  );
}
