import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  getToken,
  type AppCheck,
} from 'firebase/app-check';
import { getFirebaseApp } from './app';
import { isFirebaseConfigured } from './config';

let initialized = false;
let tokenVerified = false;
let appCheckInstance: AppCheck | null = null;

function envTrim(name: string): string {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function applyDebugTokenIfConfigured(): void {
  const debugToken = envTrim('VITE_FIREBASE_APP_CHECK_DEBUG_TOKEN');
  if (!debugToken) return;
  // Allow debug tokens in production builds (Lovable preview / staging).
  (globalThis as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN =
    debugToken;
}

function buildProvider(siteKey: string) {
  const kind = envTrim('VITE_FIREBASE_APP_CHECK_PROVIDER').toLowerCase();
  if (kind === 'v3' || kind === 'recaptcha-v3') {
    return new ReCaptchaV3Provider(siteKey);
  }
  return new ReCaptchaEnterpriseProvider(siteKey);
}

/**
 * Register App Check before any Firebase AI Logic calls.
 * Web uses reCAPTCHA Enterprise or v3; native providers are configured in Firebase Console.
 */
export function initFirebaseAppCheck(): void {
  if (initialized || typeof window === 'undefined') return;
  if (!isFirebaseConfigured()) return;

  applyDebugTokenIfConfigured();

  const siteKey = envTrim('VITE_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY');
  if (!siteKey) {
    if (import.meta.env.DEV) {
      console.warn(
        '[AppCheck] VITE_FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY not set — client AI uses Cloud Function fallback',
      );
    }
    return;
  }

  try {
    appCheckInstance = initializeAppCheck(getFirebaseApp(), {
      provider: buildProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    initialized = true;
    void verifyAppCheckToken().catch(() => {
      tokenVerified = false;
    });
  } catch (err) {
    console.error('[AppCheck] init failed:', err);
    initialized = false;
    appCheckInstance = null;
  }
}

/** True when initializeAppCheck ran (token may still be invalid). */
export function isAppCheckInitialized(): boolean {
  return initialized;
}

/** True after a successful getToken() — safe for Firebase AI Logic limited-use tokens. */
export function isAppCheckTokenVerified(): boolean {
  return tokenVerified;
}

export async function verifyAppCheckToken(): Promise<boolean> {
  if (!appCheckInstance) {
    tokenVerified = false;
    return false;
  }
  try {
    const { token } = await getToken(appCheckInstance, false);
    tokenVerified = !!token;
    return tokenVerified;
  } catch (err) {
    tokenVerified = false;
    if (import.meta.env.DEV) {
      console.warn('[AppCheck] token verification failed:', err);
    }
    return false;
  }
}
