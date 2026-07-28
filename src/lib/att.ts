/**
 * App Tracking Transparency (iOS 14.5+).
 *
 * App Privacy declares Tracking = Yes (AdMob / identifiers). The **system ATT
 * prompt comes from the native shell. Despia exposes `trackingDisabled`; the
 * committed Capacitor shell uses FirebaseAuthentication's ATT bridge.
 *
 * Do NOT show a second in-app tracking dialog on native — it caused App Review
 * blank screens when stacked with the system ATT sheet.
 */

import { isDespiaRuntime } from '@/lib/despiaBridge';
import { isIOS, isNativePlatform } from '@/lib/capacitor';

export type ATTStatus = 'authorized' | 'denied' | 'notDetermined' | 'restricted' | 'unsupported';

export const TRACKING_CONSENT_KEY = 'vybe_tracking_consent';
export const TRACKING_CONSENT_CHANGED_EVENT = 'vybe:tracking-consent-changed';
const ATT_REQUESTED_KEY = 'vybe-att-requested-v1';

let cachedStatus: ATTStatus | null = null;

type NativeATTStatus = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied' | 'restricted';

export function mapNativeATTStatus(status: NativeATTStatus): ATTStatus {
  if (status === 'granted') return 'authorized';
  if (status === 'denied') return 'denied';
  if (status === 'restricted') return 'restricted';
  return 'notDetermined';
}

export function persistTrackingConsent(consent: 'allowed' | 'denied'): void {
  try {
    localStorage.setItem(TRACKING_CONSENT_KEY, consent);
    window.dispatchEvent(new CustomEvent(TRACKING_CONSENT_CHANGED_EVENT, { detail: consent }));
  } catch { /* ignore */ }
}

function persistNativeATTStatus(status: ATTStatus): ATTStatus {
  cachedStatus = status;
  if (status === 'authorized') persistTrackingConsent('allowed');
  if (status === 'denied' || status === 'restricted') persistTrackingConsent('denied');
  if (status !== 'notDetermined' && status !== 'unsupported') {
    try { localStorage.setItem(ATT_REQUESTED_KEY, '1'); } catch { /* ignore */ }
  }
  return status;
}

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
    persistTrackingConsent(consent);
    localStorage.setItem(ATT_REQUESTED_KEY, '1');
  } catch { /* ignore */ }

  cachedStatus = trackingDisabled ? 'denied' : 'authorized';
  return consent;
}

/** Read the actual iOS ATT state from the committed Capacitor native shell. */
export async function syncCapacitorTrackingConsent(): Promise<ATTStatus> {
  if (!isNativePlatform || !isIOS || isDespiaRuntime()) return 'unsupported';
  try {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    const result = await FirebaseAuthentication.checkAppTrackingTransparencyPermission();
    return persistNativeATTStatus(mapNativeATTStatus(result.status));
  } catch (error) {
    console.warn('[ATT] Unable to read iOS tracking permission:', error);
    cachedStatus = 'unsupported';
    return cachedStatus;
  }
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
  if (isDespiaRuntime()) {
    const synced = syncNativeTrackingConsent();
    if (synced === 'allowed') return 'authorized';
    if (synced === 'denied') return 'denied';
    cachedStatus = 'notDetermined';
    return cachedStatus;
  }

  if (isNativePlatform && isIOS) {
    const current = await syncCapacitorTrackingConsent();
    if (current !== 'notDetermined') return current;
    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      const result = await FirebaseAuthentication.requestAppTrackingTransparencyPermission();
      return persistNativeATTStatus(mapNativeATTStatus(result.status));
    } catch (error) {
      console.warn('[ATT] Unable to request iOS tracking permission:', error);
    }
  }

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
