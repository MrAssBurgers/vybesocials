import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getFirebaseApp } from './app';
import { isFirebaseConfigured } from './config';

let initialized = false;

/**
 * Register App Check before any Firebase AI Logic calls.
 * Web uses reCAPTCHA Enterprise; native providers are configured in Firebase Console.
 */
export function initFirebaseAppCheck(): void {
  if (initialized || typeof window === 'undefined') return;
  if (!isFirebaseConfigured()) return;

  const debugToken = envTrim('VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN');
  if (import.meta.env.DEV && debugToken) {
    (globalThis as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      debugToken;
  }

  const siteKey = envTrim('VITE_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY');
  if (!siteKey) {
    if (import.meta.env.DEV) {
      console.warn(
        '[AppCheck] VITE_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY not set — AI works only while App Check is unenforced',
      );
    }
    return;
  }

  try {
    initializeAppCheck(getFirebaseApp(), {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    initialized = true;
  } catch (err) {
    console.error('[AppCheck] init failed:', err);
  }
}

export function isAppCheckInitialized(): boolean {
  return initialized;
}

function envTrim(name: string): string {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : '';
}
