/**
 * Despia rewarded ads bridge for Watch & Earn (Token Wallet).
 *
 * AdMob App ID + unit IDs are configured in the **Despia dashboard**, not in code.
 * The web app fires `displayrewardedad://` and listens for
 * `window.updateRewardedStatus(status)`.
 *
 * @see https://setup.despia.com/native-features/admob/rewarded-ads.md
 */

import despia from 'despia-native';
import { isDespiaRuntime } from './despiaBridge';

/** Reference IDs — must match Despia dashboard (Android). Not read at runtime. */
export const DESPIA_ADMOB_IDS = {
  android: {
    appId: 'ca-app-pub-9952523729646293~5191550874',
    rewarded: 'ca-app-pub-9952523729646293/962472048',
    nativeAdvanced: 'ca-app-pub-9952523729646293/5403238592',
  },
} as const;

export const REWARDED_AD_COMPLETE_EVENT = 'vybe:rewarded-ad-complete';

declare global {
  interface Window {
    updateRewardedStatus?: (status: string | boolean) => void;
  }
}

type PendingRequest = {
  resolve: (granted: boolean) => void;
  timeout: ReturnType<typeof setTimeout>;
  dismissWatch?: () => void;
};

let pending: PendingRequest | null = null;
let bridgeInstalled = false;
let visibilityHandler: (() => void) | null = null;

function normalizeRewardStatus(status: unknown): boolean {
  if (status === true || status === 1) return true;
  if (typeof status === 'string') {
    const s = status.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'completed' || s === 'reward' || s === 'granted';
  }
  return false;
}

function settlePending(granted: boolean) {
  const req = pending;
  if (!req) return;
  clearTimeout(req.timeout);
  req.dismissWatch?.();
  pending = null;
  req.resolve(granted);
  try {
    window.dispatchEvent(
      new CustomEvent(REWARDED_AD_COMPLETE_EVENT, { detail: { granted } }),
    );
  } catch {
    /* ignore */
  }
}

function installDismissWatcher() {
  if (visibilityHandler) return;

  const onReturn = () => {
    if (!pending || document.visibilityState !== 'visible') return;
    // User returned from ad overlay — if Despia never called back, close loading soon.
    window.setTimeout(() => {
      if (pending) {
        console.warn('[Despia] Rewarded ad dismissed without callback — clearing loading');
        settlePending(false);
      }
    }, 1800);
  };

  visibilityHandler = onReturn;
  document.addEventListener('visibilitychange', onReturn);
  window.addEventListener('pageshow', onReturn);
  window.addEventListener('focus', onReturn);
}

function removeDismissWatcher() {
  if (!visibilityHandler) return;
  document.removeEventListener('visibilitychange', visibilityHandler);
  window.removeEventListener('pageshow', visibilityHandler);
  window.removeEventListener('focus', visibilityHandler);
  visibilityHandler = null;
}

/**
 * Register `window.updateRewardedStatus` before React mounts so Despia can
 * call back as soon as a rewarded ad completes.
 */
export function installDespiaRewardedAdBridge(): void {
  if (typeof window === 'undefined') return;

  window.updateRewardedStatus = (status: string | boolean) => {
    if (!isDespiaRuntime()) {
      console.warn('[Despia] updateRewardedStatus ignored — not Despia runtime');
      return;
    }
    const granted = normalizeRewardStatus(status);
    console.log('[Despia] updateRewardedStatus', status, '→', granted);
    settlePending(granted);
  };

  bridgeInstalled = true;
}

/**
 * Show a Despia rewarded ad and resolve when the native runtime calls back.
 * Resolves `false` on timeout, dismiss without callback, or incomplete watch.
 */
export function requestDespiaRewardedAd(timeoutMs = 45_000): Promise<boolean> {
  if (!isDespiaRuntime()) return Promise.resolve(false);
  installDespiaRewardedAdBridge();

  if (pending) {
    console.warn('[Despia] Rewarded ad already in flight');
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      console.warn('[Despia] Rewarded ad timed out');
      settlePending(false);
    }, timeoutMs);

    pending = {
      resolve,
      timeout,
      dismissWatch: removeDismissWatcher,
    };

    installDismissWatcher();

    try {
      despia('displayrewardedad://');
    } catch (err) {
      clearTimeout(timeout);
      pending = null;
      removeDismissWatcher();
      console.error('[Despia] displayrewardedad failed', err);
      resolve(false);
    }
  });
}
