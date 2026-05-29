/**
 * App Tracking Transparency (iOS 14.5+).
 *
 * The Despia shell handles the ATT system prompt natively as part of its own
 * AdMob initialization — we don't need to (and can't) trigger it from the
 * WebView with `@capacitor-community/admob` since Capacitor native plugins
 * aren't part of our build (Despia-only policy).
 *
 * These helpers remain as a thin shim so calling sites compile and behave
 * gracefully on web. Treat all results as 'unsupported' outside Despia.
 */

export type ATTStatus = 'authorized' | 'denied' | 'notDetermined' | 'restricted' | 'unsupported';

const ATT_REQUESTED_KEY = 'vybe-att-requested-v1';
let cachedStatus: ATTStatus | null = null;

export async function requestTrackingAuthorization(): Promise<ATTStatus> {
  // Despia owns the ATT prompt lifecycle; nothing for the WebView to do.
  cachedStatus = 'unsupported';
  return cachedStatus;
}

export function getCachedATTStatus(): ATTStatus | null {
  return cachedStatus;
}

export function isTrackingAuthorized(): boolean {
  return cachedStatus === 'authorized';
}

export function hasRequestedATT(): boolean {
  try {
    return localStorage.getItem(ATT_REQUESTED_KEY) === '1';
  } catch {
    return false;
  }
}
