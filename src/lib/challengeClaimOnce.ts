import { db } from '@/lib/firebase';
import { toast } from 'sonner';

const TOAST_ID = 'vybe-challenge-claim';
const jobs = new Map<string, Promise<ClaimedChallengeReward | null>>();
const byChallenge = new Map<string, Promise<ClaimedChallengeReward | null>>();
let announcedXp = 0;
let resetTimer: ReturnType<typeof setTimeout> | null = null;

export interface ClaimedChallengeReward {
  success?: boolean;
  already_claimed?: boolean;
  xp_gained?: number;
  challenge_id?: string;
  level_result?: {
    old_level: number;
    new_level: number;
    total_xp: number;
    level_up: boolean;
    new_rewards?: unknown[];
  };
}

function announce(xp: number) {
  announcedXp += Math.max(0, Math.floor(xp) || 0);
  toast.success(announcedXp > 0 ? `+${announcedXp} XP claimed` : 'Reward claimed', {
    id: TOAST_ID,
    duration: 3200,
  });
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    announcedXp = 0;
    resetTimer = null;
  }, 3200);
}

/** One claim and one toast per reward, even if realtime fires more than once. */
export function claimChallengeRewardOnce(
  rewardId: string,
  xp = 0,
  challengeId?: string,
): Promise<ClaimedChallengeReward | null> {
  if (!rewardId || rewardId.includes('/')) return Promise.resolve(null);
  if (challengeId && byChallenge.has(challengeId)) return byChallenge.get(challengeId)!;
  const existing = jobs.get(rewardId);
  if (existing) return existing;

  const job = (async () => {
    const { data, error } = await db.rpc('claim_challenge_reward', { p_reward_id: rewardId });
    if (error || (!data?.success && !data?.already_claimed)) {
      jobs.delete(rewardId);
      if (challengeId) byChallenge.delete(challengeId);
      const message = String(error?.message || '');
      toast.error(/reconciliation|could not be verified/i.test(message)
        ? 'That reward could not be verified yet. Finish the challenge and try again.'
        : 'Could not claim that reward', { id: `vybe-challenge-claim-error-${rewardId}` });
      return null;
    }
    if (!data.already_claimed) {
      const gained = typeof data.xp_gained === 'number' ? data.xp_gained : xp;
      if (gained > 0) announce(gained);
    }
    return data as ClaimedChallengeReward;
  })();
  jobs.set(rewardId, job);
  if (challengeId) byChallenge.set(challengeId, job);
  return job;
}

export function resetChallengeClaimsForTests() {
  jobs.clear();
  byChallenge.clear();
  announcedXp = 0;
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = null;
}
