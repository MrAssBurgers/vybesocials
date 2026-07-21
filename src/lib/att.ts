/**
 * App Tracking Transparency (iOS 14.5+).
 *
 * App Privacy declares Tracking = Yes (AdMob / identifiers). The **system ATT
 * prompt must come from the Despia native shell** (AdMob/ATT). Web only mirrors
 * `despia.trackingDisabled` into local consent for personalized ads.
 *
 * Do NOT show a second in-app tracking dialog on native — it caused App Review
 * blank screens when stacked with the system ATT sheet.
 */

import { isDespiaRuntime } from '@/lib/despiaBridge';

export type ATTStatus = 'authorized' | 'denied' | 'notDetermined' | 'restricted' | 'unsupported';

export const TRACKING_CONSENT_KEY = 'vybe_tracking_consent';
const ATT_REQUESTED_KEY = 'vybe-att-requested-v1';

let cachedStatus: ATTStatus | null = null;

function readDespiaTrackingDisabled(): boolean | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    despia?: { trackingDisabled?: boolean };
    trackingDisabled?: boolean;
  };
  const value = w.despia?.trackingDisabled ?? w.trackingDisabled;
  if (typeof value === 'boolean') return value;
  return null;
}

/** Sync Despia ATT result into localStorage. Call at boot and after resume. */
export function syncNativeTrackingConsent(): 'allowed' | 'denied' | null {
  if (!isDespiaRuntime()) return null;
  const trackingDisabled = readDespiaTrackingDisabled();
  if (trackingDisabled === null) return null;

  const consent: 'allowed' | 'denied' = trackingDisabled ? 'denied' : 'allowed';
  try {
    localStorage.setItem(TRACKING_CONSENT_KEY, consent);
    localStorage.setItem(ATT_REQUESTED_KEY, '1');
  } catch { /* ignore */ }

  cachedStatus = trackingDisabled ? 'denied' : 'authorized';
  return consent;
}

/**
 * Despia may set trackingDisabled slightly after the ATT sheet closes.
 * Poll briefly after resume so consent + splash dismiss stay in sync.
 */
export function pollNativeTrackingConsent(
  maxMs = 3000,
  intervalMs = 150,
): () => void {
  if (!isDespiaRuntime()) return () => {};
  const started = performance.now();
  syncNativeTrackingConsent();
  const id = window.setInterval(() => {
    syncNativeTrackingConsent();
    if (performance.now() - started >= maxMs) {
      window.clearInterval(id);
    }
  }, intervalMs);
  return () => window.clearInterval(id);
}

export async function requestTrackingAuthorization(): Promise<ATTStatus> {
  const synced = syncNativeTrackingConsent();
  if (synced === 'allowed') return 'authorized';
  if (synced === 'denied') return 'denied';
  cachedStatus = 'unsupported';
  return cachedStatus;
}

export function getCachedATTStatus(): ATTStatus | null {
  return cachedStatus;
}

export function isTrackingAuthorized(): boolean {
  if (cachedStatus === 'authorized') return true;
  if (cachedStatus === 'denied') return false;
  try {
    return localStorage.getItem(TRACKING_CONSENT_KEY) === 'allowed';
  } catch {
    return false;
  }
}

export function hasRequestedATT(): boolean {
  try {
    return localStorage.getItem(ATT_REQUESTED_KEY) === '1';
  } catch {
    return false;
  }
}
