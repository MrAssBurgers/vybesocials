/**
 * Despia rewarded ads bridge for Watch & Earn (Token Wallet).
 *
 * AdMob App ID + unit IDs are configured in the **Despia dashboard**, not in code.
 * The web app only fires `displayrewardedad://` and listens for
 * `window.updateRewardedStatus(status)`.
 *
 * @see https://setup.despia.com/native-features/admob/rewarded-ads.md
 */

import despia from 'despia-native';
import { isDespiaRuntime } from './despiaBridge';

/** Reference IDs — must match Despia dashboard (Android). Not read at runtime. */
export const DESPIA_ADMOB_IDS = {
  android: {
    appId: 'ca-app-pub-9952523729646293~519155087',
    rewarded: 'ca-app-pub-9952523729646293/962472048',
  },
} as const;

declare global {
  interface Window {
    updateRewardedStatus?: (status: string | boolean) => void;
  }
}

type PendingRequest = {
  resolve: (granted: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
};

let pending: PendingRequest | null = null;
let bridgeInstalled = false;

function normalizeRewardStatus(status: unknown): boolean {
  if (status === true || status === 1) return true;
  if (typeof status === 'string') {
    const s = status.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'completed' || s === 'reward';
  }
  return false;
}

/**
 * Register `window.updateRewardedStatus` before React mounts so Despia can
 * call back as soon as a rewarded ad completes.
 */
export function installDespiaRewardedAdBridge(): void {
  if (typeof window === 'undefined' || bridgeInstalled) return;
  bridgeInstalled = true;

  window.updateRewardedStatus = (status: string | boolean) => {
    if (!isDespiaRuntime()) {
      console.warn('[Despia] updateRewardedStatus ignored — not Despia runtime');
      return;
    }
    const granted = normalizeRewardStatus(status);
    const req = pending;
    if (!req) return;
    clearTimeout(req.timeout);
    pending = null;
    req.resolve(granted);
  };
}

/**
 * Show a Despia rewarded ad and resolve when the native runtime calls back.
 * Resolves `false` on timeout, bridge error, or incomplete watch.
 */
export function requestDespiaRewardedAd(timeoutMs = 120_000): Promise<boolean> {
  if (!isDespiaRuntime()) return Promise.resolve(false);
  installDespiaRewardedAdBridge();

  if (pending) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      if (pending) {
        pending = null;
        resolve(false);
      }
    }, timeoutMs);
    pending = { resolve, timeout };
    try {
      despia('displayrewardedad://');
    } catch (err) {
      clearTimeout(timeout);
      pending = null;
      console.error('[Despia] displayrewardedad failed', err);
      resolve(false);
    }
  });
}
