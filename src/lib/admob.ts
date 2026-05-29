/**
 * AdMob integration for VYBE — Despia-only.
 *
 * IMPORTANT: This module used to depend on `@capacitor-community/admob`. That
 * plugin requires a native Xcode/Android Studio build via `npx cap sync`, which
 * is explicitly forbidden by project policy — we ship through Despia only.
 * Inside the Despia shell that plugin is never compiled in, so every call
 * silently failed and the wallet's "Watch & Earn" never delivered an ad.
 *
 * Despia bridge schemes used here:
 *   - displayrewardedad://     → fires rewarded video; result returned via the
 *                                global `window.updateRewardedStatus(status)`
 *                                callback (see useRewardedAd.ts).
 *   - displayinterstitialad:// → fires an interstitial (fire-and-forget).
 *   - displaybannerad://       → shows the bottom banner.
 *   - hidebannerad://          → hides the banner.
 *
 * The AdMob App ID + unit IDs are configured in the Despia dashboard, not in
 * client code. AdMob's test/production behavior is chosen there as well.
 */

import despia from 'despia-native';
import { isDespiaRuntime } from './despiaBridge';

let initialized = false;

function safeDespia(url: string): boolean {
  if (!isDespiaRuntime()) return false;
  try {
    despia(url);
    return true;
  } catch (err) {
    console.warn('[AdMob:Despia] bridge call failed', url, err);
    return false;
  }
}

export async function initializeAdMob(): Promise<void> {
  if (initialized) return;
  if (!isDespiaRuntime()) {
    // No-op on web preview — Despia owns the AdMob lifecycle in native.
    return;
  }
  initialized = true;
  console.log('[AdMob] Initialized (Despia bridge mode)');
}

export async function showBanner(): Promise<void> {
  safeDespia('displaybannerad://');
}

export async function hideBanner(): Promise<void> {
  safeDespia('hidebannerad://');
}

export async function removeBanner(): Promise<void> {
  // Despia treats hide as remove for banner cleanup.
  safeDespia('hidebannerad://');
}

export async function showInterstitial(): Promise<void> {
  safeDespia('displayinterstitialad://');
}

/**
 * Fire a rewarded ad via Despia. The actual reward outcome is delivered
 * asynchronously through `window.updateRewardedStatus(status)` — see
 * `src/hooks/useRewardedAd.ts`, which owns the Promise wiring and the
 * tokens grant. This helper exists so legacy callers that only need to
 * trigger an ad (without awaiting the reward) keep working; it resolves
 * to `null` because the reward shape can only be known via the callback.
 */
export async function showRewarded(): Promise<{ amount: number; type: string } | null> {
  safeDespia('displayrewardedad://');
  return null;
}
