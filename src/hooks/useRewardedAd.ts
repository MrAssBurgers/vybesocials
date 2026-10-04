import { useCallback } from 'react';
import { toast } from 'sonner';

/** Browser/native completion events are not proof of a payable ad impression. */
export const REWARD_PER_AD = 0;
export const DAILY_AD_LIMIT = 0;
export const COOLDOWN_MS = 0;
export function useRewardedAd() {
  const watchAd = useCallback(async () => {
    toast.info('Watch & Earn is unavailable until verified ad rewards are connected.');
  }, []);
  return { watchAd, available: false, canWatch: false, isLoading: false, onCooldown: false,
    cooldownRemaining: 0, capReached: false, remainingToday: 0, dailyLimit: 0,
    rewardPerAd: 0, watchedToday: 0, isNative: false };
}
