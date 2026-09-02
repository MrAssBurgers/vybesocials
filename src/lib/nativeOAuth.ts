/**
 * Platform-aware OAuth — Despia store builds, Capacitor shells, Safari/PWA, desktop.
 *
 * Despia Google: oauth:// (ASWeb / Custom Tabs).
 * Despia Apple on iOS: Apple JS SDK with usePopup:true, which Despia maps to
 * the native Apple ID / Face ID sheet inside WKWebView.
 * Despia Apple on Android: oauth:// through Chrome Custom Tabs.
 * True AuthenticationServices is preferred when the nativeauth:// bridge is
 * advertised. Capacitor Firebase auth is skipped inside Despia WebView.
 */
import { getRuntimeOs, isDespiaRuntime, isNativeAppShell } from '@/lib/despiaBridge';
import { isNativePlatform } from '@/lib/capacitor';
import { signInWithAppleDespia, signInWithGoogleDespia } from '@/lib/despiaOAuth';
import {
  shouldUseNativeAuth,
  signInWithApple as signInWithAppleNativeAuth,
  signInWithGoogle as signInWithGoogleNativeAuth,
} from '@/lib/nativeAuth';
import {
  detectOAuthPlatform,
  shouldUseRedirectOAuthPlatform,
  type OAuthPlatformInfo,
} from '@/lib/oauthPlatform';
import { authLog, authWarn } from '@/lib/authLog';
import { mapOAuthLinkError } from '@/lib/oauthAccountLink';
import { oauthTimelineLog } from '@/lib/oauthDebugTimeline';
import type { VybeAuthError, VybeSession } from '@/lib/firebase/types';

export type OAuthProviderId = 'google' | 'apple';

export type OAuthSignInResult = {
  data: { session: VybeSession | null };
  error: VybeAuthError | null;
  redirected?: boolean;
  /** Despia oauth:// — session completes asynchronously via deeplink. */
  pending?: boolean;
};

let oauthMutexUntil = 0;
let oauthInFlight: Promise<OAuthSignInResult> | null = null;

export function getOAuthPlatformInfo(): OAuthPlatformInfo {
  return detectOAuthPlatform();
}

export function isOAuthBusy(): boolean {
  return oauthInFlight != null || Date.now() < oauthMutexUntil;
}

/** Clear tap mutex so a second provider (e.g. Apple after stuck Google) can start. */
export function clearOAuthBusy(): void {
  oauthMutexUntil = 0;
  oauthInFlight = null;
}

export function shouldUseNativeOAuth(): boolean {
  return isNativeAppShell();
}

export function shouldUseRedirectOAuth(): boolean {
  if (isNativeAppShell()) return false;
  return shouldUseRedirectOAuthPlatform();
}

/**
 * Despia browser bridge routing.
 * Google uses oauth:// on both store platforms. Apple uses oauth:// only on
 * Android; iOS must use the Apple JS native-sheet path below.
 */
export function shouldUseDespiaOAuth(provider: OAuthProviderId): boolean {
  if (!isDespiaRuntime()) return false;
  if (provider === 'google') return true;
  return provider === 'apple' && getRuntimeOs() !== 'ios';
}

/** Despia iOS Apple route: Apple JS usePopup:true, no ASWeb pre-sheet. */
export function shouldUseDespiaAppleJs(provider: OAuthProviderId): boolean {
  return isDespiaRuntime() && getRuntimeOs() === 'ios' && provider === 'apple';
}

/**
 * [iOS-only] True when flag `native_ios_auth_v1` is ON and Despia advertises
 * the nativeauth:// bridge. Exported for tests. Android always false.
 */
export function shouldUseNativeAuthBridge(provider: OAuthProviderId): boolean {
  return shouldUseNativeAuth(provider);
}

async function tryNativeAuthBridge(provider: OAuthProviderId): Promise<OAuthSignInResult> {
  const result =
    provider === 'apple'
      ? await signInWithAppleNativeAuth()
      : await signInWithGoogleNativeAuth();
  return {
    data: { session: result.data.session },
    error: result.error ? mapOAuthLinkError(result.error) : null,
  };
}

async function tryCapacitorNativeOAuth(provider: OAuthProviderId): Promise<OAuthSignInResult | null> {
  if (!isNativePlatform || isDespiaRuntime()) return null;
  try {
    const { firebaseAuth } = await import('@/lib/firebase');
    return firebaseAuth.signInWithOAuthNative(provider);
  } catch {
    return null;
  }
}

async function tryDespiaGoogleOAuth(): Promise<OAuthSignInResult> {
  const result = await signInWithGoogleDespia();
  if (result.error) {
    return { data: { session: null }, error: mapOAuthLinkError(result.error) };
  }
  return { data: { session: null }, error: null, pending: true };
}

async function tryDespiaAppleOAuth(): Promise<OAuthSignInResult> {
  const result = await signInWithAppleDespia();
  if (result.error) {
    return { data: { session: null }, error: mapOAuthLinkError(result.error) };
  }
  if (result.data?.session?.user) {
    return { data: { session: result.data.session }, error: null };
  }
  if (result.pending) {
    return { data: { session: null }, error: null, pending: true };
  }
  return {
    data: { session: null },
    error: {
      message: 'Apple Sign-In did not finish. Try again, or use email login.',
      name: 'apple/incomplete',
    },
  };
}

/**
 * iOS Despia Apple flow. A valid Firebase session is authoritative even when a
 * late Apple/WebView callback reports an opaque error, preventing the false
 * "internal error" toast that previously appeared after successful sign-in.
 */
async function tryDespiaAppleJs(): Promise<OAuthSignInResult> {
  const { signInWithAppleJsSdk } = await import('@/lib/appleSignIn');
  const result = await signInWithAppleJsSdk();

  if (result.data.session?.user) {
    return { data: { session: result.data.session }, error: null };
  }

  if (result.error) {
    try {
      const { firebaseAuth } = await import('@/lib/firebase');
      const recovered = await firebaseAuth.getSession();
      if (recovered.data.session?.user) {
        authWarn('apple_js_late_error_ignored', {
          code: result.error.name || '',
        });
        return { data: { session: recovered.data.session }, error: null };
      }
    } catch {
      /* keep original Apple error */
    }
    return { data: { session: null }, error: mapOAuthLinkError(result.error) };
  }

  return {
    data: { session: null },
    error: {
      message: 'Apple Sign-In did not finish. Try again, or use email login.',
      name: 'apple/incomplete',
    },
  };
}

async function signInWithOAuthPlatformInner(provider: OAuthProviderId): Promise<OAuthSignInResult> {
  const platform = detectOAuthPlatform();
  const useNativeBridge = shouldUseNativeAuthBridge(provider);
  const useDespiaAppleJs = shouldUseDespiaAppleJs(provider);
  const useDespia = !useNativeBridge && !useDespiaAppleJs && shouldUseDespiaOAuth(provider);
  const strategy = useNativeBridge
    ? 'native-auth-bridge'
    : useDespiaAppleJs
      ? 'despia-apple-js'
      : useDespia
        ? 'despia-oauth'
        : platform.strategy;

  oauthTimelineLog(
    'oauth_tap',
    {
      provider,
      strategy,
      os: getRuntimeOs(),
      despia: isDespiaRuntime(),
      host: typeof location !== 'undefined' ? location.hostname : '',
    },
    'nativeOAuth.ts:signInWithOAuthPlatformInner',
  );
  authLog('oauth_start', {
    provider,
    strategy,
    host: typeof location !== 'undefined' ? location.hostname : '',
    path: typeof location !== 'undefined' ? location.pathname : '',
  });

  // Prefer true native auth when flag + bridge are available.
  // A bridge availability failure falls through to the platform-specific Despia path.
  if (useNativeBridge) {
    authLog('oauth_strategy', {
      provider,
      strategy: 'native-auth-bridge',
    });
    const nativeResult = await tryNativeAuthBridge(provider);
    if (
      !nativeResult.error ||
      (nativeResult.error && !isRetryableNativeError(nativeResult.error))
    ) {
      return nativeResult;
    }
    authWarn('native_auth_fallback_despia', {
      provider,
      code: nativeResult.error?.name,
    });
  }

  // iOS Apple must go directly to Apple JS usePopup:true. This avoids opening
  // an ASWebAuthenticationSession before Apple's native account sheet.
  if (useDespiaAppleJs) {
    authLog('oauth_strategy', {
      provider,
      strategy: 'despia-apple-js',
    });
    return tryDespiaAppleJs();
  }

  // Despia oauth:// — Google on iOS/Android and Apple on Android only.
  if (shouldUseDespiaOAuth(provider)) {
    authLog('oauth_strategy', {
      provider,
      strategy: 'despia-oauth',
    });
    if (provider === 'google') return tryDespiaGoogleOAuth();
    return tryDespiaAppleOAuth();
  }

  if (shouldUseNativeOAuth() && !isDespiaRuntime()) {
    const nativeResult = await tryCapacitorNativeOAuth(provider);
    if (nativeResult && !nativeResult.error && nativeResult.data.session?.user) {
      return nativeResult;
    }
    if (nativeResult?.error && !isRetryableNativeError(nativeResult.error)) {
      return { ...nativeResult, error: mapOAuthLinkError(nativeResult.error) };
    }
    const { firebaseAuth } = await import('@/lib/firebase');
    const baseOpts =
      provider === 'google'
        ? { extraParams: { prompt: 'select_account' as const }, useRedirect: true }
        : { useRedirect: true };
    return firebaseAuth.signInWithOAuth(provider, baseOpts);
  }

  const useRedirect = shouldUseRedirectOAuth();
  const { firebaseAuth } = await import('@/lib/firebase');
  const baseOpts =
    provider === 'google'
      ? { extraParams: { prompt: 'select_account' as const }, useRedirect }
      : { useRedirect };

  authLog('oauth_strategy', {
    provider,
    strategy: useRedirect ? 'redirect' : 'popup',
  });

  let oauthResult = await firebaseAuth.signInWithOAuth(provider, baseOpts);
  if (oauthResult.redirected) return oauthResult;
  if (oauthResult.error) {
    oauthResult = { ...oauthResult, error: mapOAuthLinkError(oauthResult.error) };
  }

  if (
    oauthResult.error &&
    !useRedirect &&
    (oauthResult.error.name === 'auth/popup-blocked' ||
      oauthResult.error.name === 'auth/popup-closed-by-user')
  ) {
    authWarn('popup_fallback_redirect', { code: oauthResult.error.name });
    oauthResult = await firebaseAuth.signInWithOAuth(provider, { ...baseOpts, useRedirect: true });
  }

  return oauthResult;
}

/** Mutex + 3s ignore window — prevents double taps / Strict Mode duplicate redirects. */
export async function signInWithOAuthPlatform(provider: OAuthProviderId): Promise<OAuthSignInResult> {
  const now = Date.now();
  if (oauthInFlight) return oauthInFlight;
  if (now < oauthMutexUntil) {
    return {
      data: { session: null },
      error: { message: 'Sign-in already in progress', name: 'vybe/oauth-busy' },
    };
  }

  oauthMutexUntil = now + 3000;
  oauthInFlight = signInWithOAuthPlatformInner(provider).finally(() => {
    oauthInFlight = null;
  });
  return oauthInFlight;
}

function isRetryableNativeError(error: VybeAuthError): boolean {
  const code = (error.name || '').toLowerCase();
  const msg = (error.message || '').toLowerCase();
  return (
    msg.includes('not implemented') ||
    msg.includes('unavailable') ||
    code.includes('not-available') ||
    code.includes('nativeauth/unavailable') ||
    code.includes('nativeauth/bridge') ||
    msg.includes('plugin') ||
    msg.includes('bridge')
  );
}
