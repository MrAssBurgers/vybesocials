/**
 * App Tracking Transparency (iOS 14.5+).
 *
 * Apple requires apps that track users across other apps/sites to show the
 * ATT prompt before any tracking begins. AdMob, Stripe analytics, and most
 * SDKs treat the user as opted-out until ATT returns `authorized`.
 *
 * We use AdMob's built-in tracking-authorization helper (no extra plugin
 * needed) so the prompt fires once on first launch, *before* AdMob.initialize.
 *
 * Spec: https://developer.apple.com/app-store/user-privacy-and-data-use/
 */

import { AdMob } from '@capacitor-community/admob';
import { isIOS, isNativePlatform } from './capacitor';

const ATT_REQUESTED_KEY = 'vybe-att-requested-v1';

export type ATTStatus = 'authorized' | 'denied' | 'notDetermined' | 'restricted' | 'unsupported';

let cachedStatus: ATTStatus | null = null;

export async function requestTrackingAuthorization(): Promise<ATTStatus> {
  if (!isNativePlatform || !isIOS) {
    cachedStatus = 'unsupported';
    return cachedStatus;
  }

  try {
    const current = await AdMob.trackingAuthorizationStatus();
    if (current.status !== 'notDetermined') {
      cachedStatus = current.status as ATTStatus;
      return cachedStatus;
    }

    // Show the system ATT prompt (one-shot — Apple won't show it again
    // unless the app is reinstalled). Returns void; re-query status after.
    await AdMob.requestTrackingAuthorization();
    const after = await AdMob.trackingAuthorizationStatus();
    cachedStatus = after.status as ATTStatus;
    localStorage.setItem(ATT_REQUESTED_KEY, '1');
    return cachedStatus;
  } catch (err) {
    console.warn('[ATT] Request failed:', err);
    cachedStatus = 'unsupported';
    return cachedStatus;
  }
}

export function getCachedATTStatus(): ATTStatus | null {
  return cachedStatus;
}

/** True only when the user explicitly authorized cross-app tracking. */
export function isTrackingAuthorized(): boolean {
  return cachedStatus === 'authorized';
}

export function hasRequestedATT(): boolean {
  return localStorage.getItem(ATT_REQUESTED_KEY) === '1';
}
