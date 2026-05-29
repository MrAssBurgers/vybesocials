import { useCallback, useEffect, useRef, useState } from 'react';
import despia from 'despia-native';
import { isDespiaRuntime as inDespiaShell } from '@/lib/despiaBridge';
import { useEarnTokens } from '@/hooks/useVybeTokens';
import { useHasBoost } from '@/hooks/useActiveBoosts';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { hapticNotification } from '@/lib/capacitor';

/**
 * Watch & Earn rewarded-ad system.
 *
 * Two delivery paths, picked automatically:
 *   1. Despia Native Runtime (if `navigator.userAgent` contains "despia")
 *      Triggered with despia("displayrewardedad://"), the native runtime calls
 *      back into a global `updateRewardedStatus(status)` function. We only grant
 *      the reward when status === 'true' (per Despia spec).
 *   2. Capacitor + AdMob interstitial-rewarded (existing path) for native builds
 *      that aren't running inside Despia.
 *
 * Limits keep the economy healthy and protect users:
 *   - REWARD_PER_AD       VYBE Tokens granted per completed ad
 *   - DAILY_AD_LIMIT      max ads per user per UTC day
 *   - COOLDOWN_MS         minimum gap between ads (anti-spam)
 *
 * State is persisted in localStorage (per user) so refreshes/restarts
 * do not let users bypass the cap. The token grant is server-authoritative
 * via `earn_vybe_tokens` RPC, so this is a UX guard only.
 */
export const REWARD_PER_AD = 25;
export const DAILY_AD_LIMIT = 10;
export const COOLDOWN_MS = 15 * 1000; // 15 seconds — feels instant for back-to-back ads

interface RewardState {
  date: string;       // UTC YYYY-MM-DD
  count: number;      // ads watched today
  lastAt: number;     // timestamp of last completion
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadState(userId: string): RewardState {
  try {
    const raw = localStorage.getItem(`vybe_rewarded_ads_${userId}`);
    if (!raw) return { date: todayKey(), count: 0, lastAt: 0 };
    const parsed = JSON.parse(raw) as RewardState;
    if (parsed.date !== todayKey()) {
      return { date: todayKey(), count: 0, lastAt: 0 };
    }
    return parsed;
  } catch {
    return { date: todayKey(), count: 0, lastAt: 0 };
  }
}

function saveState(userId: string, s: RewardState) {
  try {
    localStorage.setItem(`vybe_rewarded_ads_${userId}`, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// True when the app is running inside the Despia native runtime.
function isDespiaRuntime(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.userAgent.toLowerCase().includes('despia');
}

// Augment the window type for the Despia callback.
declare global {
  interface Window {
    updateRewardedStatus?: (status: string) => void;
  }
}

export function useRewardedAd() {
  const { user } = useAuth();
  const earn = useEarnTokens();
  const tokens2x = useHasBoost('tokens_2x');
  const [state, setState] = useState<RewardState>(() =>
    user?.id ? loadState(user.id) : { date: todayKey(), count: 0, lastAt: 0 }
  );
  const [now, setNow] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(false);

  // Pending Despia request: resolves when updateRewardedStatus fires.
  const despiaPendingRef = useRef<{
    resolve: (granted: boolean) => void;
    timeout: ReturnType<typeof setTimeout>;
  } | null>(null);

  // Reload state when user changes
  useEffect(() => {
    if (user?.id) setState(loadState(user.id));
  }, [user?.id]);

  // Tick once per second only while a cooldown is active
  const cooldownRemaining = Math.max(0, COOLDOWN_MS - (now - state.lastAt));
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cooldownRemaining]);

  // Register the global Despia callback exactly once per app lifetime.
  // Per Despia security guidance: only act when the user agent includes "despia".
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.updateRewardedStatus) return; // already registered

    window.updateRewardedStatus = (status: string) => {
      // Hard gate: refuse calls from contexts that aren't the Despia runtime.
      if (!isDespiaRuntime()) {
        console.warn('[Despia] updateRewardedStatus called outside Despia runtime — ignored');
        return;
      }
      const granted = status === 'true';
      const pending = despiaPendingRef.current;
      if (pending) {
        clearTimeout(pending.timeout);
        despiaPendingRef.current = null;
        pending.resolve(granted);
      }
    };
  }, []);

  const remainingToday = Math.max(0, DAILY_AD_LIMIT - state.count);
  const onCooldown = cooldownRemaining > 0;
  const capReached = remainingToday <= 0;
  const canWatch = !!user?.id && !onCooldown && !capReached && !isLoading;

  // Run a Despia rewarded ad and wait for the native callback.
  const runDespiaRewarded = useCallback((): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      // 2-minute safety timeout — if the runtime never calls back, treat as no reward.
      const timeout = setTimeout(() => {
        if (despiaPendingRef.current) {
          despiaPendingRef.current = null;
          resolve(false);
        }
      }, 120_000);
      despiaPendingRef.current = { resolve, timeout };
      try {
        despia('displayrewardedad://');
      } catch (err) {
        clearTimeout(timeout);
        despiaPendingRef.current = null;
        console.error('[Despia] displayrewardedad failed', err);
        resolve(false);
      }
    });
  }, []);

  const watchAd = useCallback(async () => {
    if (!user?.id) {
      toast.error('Please sign in to earn tokens');
      return;
    }
    if (capReached) {
      toast.info(`Daily limit reached. Come back tomorrow for more rewards!`);
      return;
    }
    if (onCooldown) {
      const secs = Math.ceil(cooldownRemaining / 1000);
      toast.info(`Please wait ${secs}s before the next ad`);
      return;
    }

    setIsLoading(true);
    try {
      let granted = false;

      if (isDespiaRuntime()) {
        // Despia Native Runtime — only supported delivery path (no Capacitor).
        granted = await runDespiaRewarded();
      } else {
        // Web preview / non-Despia shell — no real ad available.
        toast.info('Rewarded ads are only available in the mobile app');
        return;
      }

      if (!granted) {
        // Per Despia/AdMob spec: status !== 'true' or no reward object → no credit.
        toast.info('Ad was not completed — no reward this time');
        return;
      }

      // Credit tokens server-side
      const earned = REWARD_PER_AD * (tokens2x ? 2 : 1);
      await earn.mutateAsync({
        amount: earned,
        type: 'rewarded_ad',
        description: tokens2x ? 'Rewarded ad (2× boost)' : 'Watched a rewarded ad',
      });

      const next: RewardState = {
        date: todayKey(),
        count: state.count + 1,
        lastAt: Date.now(),
      };
      setState(next);
      saveState(user.id, next);
      setNow(Date.now());

      hapticNotification('success');
      toast.success(`+${earned} VYBE Tokens earned! 💎`);
    } catch (err: any) {
      console.error('[RewardedAd] Failed:', err);
      toast.error('Could not load ad. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, state, capReached, onCooldown, cooldownRemaining, earn, tokens2x, runDespiaRewarded]);

  return {
    watchAd,
    canWatch,
    isLoading,
    onCooldown,
    cooldownRemaining,
    capReached,
    remainingToday,
    dailyLimit: DAILY_AD_LIMIT,
    rewardPerAd: REWARD_PER_AD,
    watchedToday: state.count,
    // True if Despia native runtime can serve a real ad on this device.
    isNative: isDespiaRuntime(),
  };
}
