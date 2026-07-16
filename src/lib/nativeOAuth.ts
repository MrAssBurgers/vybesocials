/**
 * Platform-aware OAuth — Despia store builds, Capacitor shells, Safari/PWA, desktop.
 *
 * Despia Google + Apple use oauth:// (ASWebAuthenticationSession / Custom Tabs).
 * Callback returns via HTTPS Universal/App Link to /auth?hc= (never custom-scheme
 * navigations inside ASWeb — those trigger iOS “address is invalid”).
 */
import { isDespiaRuntime, isNativeAppShell } from '@/lib/despiaBridge';
import { isEmbeddedAppleWebView } from '@/lib/deviceDetection';
import { isNativePlatform } from '@/lib/capacitor';
import { signInWithAppleDespia, signInWithGoogleDespia } from '@/lib/despiaOAuth';
import { debugSessionLog } from '@/lib/debugSessionLog';
import {
  detectOAuthPlatform,
  shouldUseRedirectOAuthPlatform,
  type OAuthPlatformInfo,
} from '@/lib/oauthPlatform';
import { authLog, authWarn } from '@/lib/authLog';
import { mapOAuthLinkError } from '@/lib/oauthAccountLink';
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
  // #region agent log
  debugSessionLog('nativeOAuth.ts:98', 'oauth_platform_entry', { provider, strategy: platform.strategy, despia: shouldUseDespiaOAuth(provider), nativeShell: shouldUseNativeOAuth() }, 'H2');
  // #endregion
  authLog('oauth_start', {
    provider,
    strategy: platform.strategy,
    host: typeof location !== 'undefined' ? location.hostname : '',
    path: typeof location !== 'undefined' ? location.pathname : '',
  });

  // Despia takes priority — never Firebase popup for Google here.
  if (shouldUseDespiaOAuth(provider)) {
    // #region agent log
    debugSessionLog('nativeOAuth.ts:109', 'oauth_strategy_despia_branch', { provider }, 'H2');
    // #endregion
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
