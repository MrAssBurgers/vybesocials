/**
 * Platform-aware OAuth — Despia store builds, Capacitor shells, Safari/PWA, desktop.
 *
 * Despia Google + Apple use oauth:// (ASWebAuthenticationSession / Custom Tabs).
 * Callback closes via HTTPS Universal/App Link to /auth?hc= on iOS and Android
 * (never custom-scheme / oauthDismiss — those trigger iOS “address is invalid”).
 */
import { getRuntimeOs, isDespiaRuntime, isNativeAppShell } from '@/lib/despiaBridge';
import { isEmbeddedAppleWebView } from '@/lib/deviceDetection';
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

/** Despia store: Google always oauth://; Apple via despiaOAuth (JS on iOS, oauth on Android). */
export function shouldUseDespiaOAuth(provider: OAuthProviderId): boolean {
  if (!isDespiaRuntime()) return false;
  if (provider === 'google' || provider === 'apple') return true;
  return !isEmbeddedAppleWebView();
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

async function signInWithOAuthPlatformInner(provider: OAuthProviderId): Promise<OAuthSignInResult> {
  const platform = detectOAuthPlatform();
  const useNativeBridge = shouldUseNativeAuthBridge(provider);
  const useDespia = !useNativeBridge && shouldUseDespiaOAuth(provider);
  const strategy = useNativeBridge
    ? 'native-auth-bridge'
    : useDespia
      ? 'despia-oauth'
      : platform.strategy;
  // #region agent log
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
  // #endregion
  authLog('oauth_start', {
    provider,
    strategy,
    host: typeof location !== 'undefined' ? location.hostname : '',
    path: typeof location !== 'undefined' ? location.pathname : '',
  });

  // [iOS-only] Prefer true native auth when flag + bridge available.
  // Never opens native-callback / oauthDismiss / exchange_* on this path.
  if (useNativeBridge) {
    authLog('oauth_strategy', {
      provider,
      strategy: 'native-auth-bridge',
    });
    return tryNativeAuthBridge(provider);
  }

  // Despia oauth:// / Apple JS — never Firebase popup for Google here.
  if (useDespia) {
    authLog('oauth_strategy', {
      provider,
      strategy: 'despia-oauth',
    });
    if (provider === 'google') return tryDespiaGoogleOAuth();
    if (provider === 'apple') return tryDespiaAppleOAuth();
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
    msg.includes('plugin')
  );
}
