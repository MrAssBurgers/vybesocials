/**
 * Platform-aware OAuth — Despia oauth:// on store builds, Capacitor native picker
 * on self-built shells, popup on desktop, redirect on mobile Safari only.
 */
import { isDespiaRuntime, isNativeAppShell } from '@/lib/despiaBridge';
import { isEmbeddedAppleWebView, isMobileSafariBrowser } from '@/lib/deviceDetection';
import { isNativePlatform } from '@/lib/capacitor';
import { signInWithGoogleDespia } from '@/lib/despiaOAuth';
import type { VybeAuthError, VybeSession } from '@/lib/firebase/types';

export type OAuthProviderId = 'google' | 'apple';

export type OAuthSignInResult = {
  data: { session: VybeSession | null };
  error: VybeAuthError | null;
  redirected?: boolean;
  /** Despia oauth:// — session completes asynchronously via deeplink. */
  pending?: boolean;
};

export function shouldUseNativeOAuth(): boolean {
  return isNativeAppShell();
}

export function shouldUseRedirectOAuth(): boolean {
  if (isNativeAppShell()) return false;
  // Popup works on desktop + Android Chrome — redirect only where popups are blocked (Mobile Safari).
  return isMobileSafariBrowser();
}

export function shouldUseDespiaOAuth(provider: OAuthProviderId): boolean {
  if (!isDespiaRuntime()) return false;
  if (provider === 'google') return true;
  // Apple on iOS WebKit supports in-WebView sign-in per Despia docs.
  if (provider === 'apple' && isEmbeddedAppleWebView()) return false;
  return true;
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
    return { data: { session: null }, error: result.error };
  }
  return { data: { session: null }, error: null, pending: true };
}

export async function signInWithOAuthPlatform(provider: OAuthProviderId): Promise<OAuthSignInResult> {
  if (shouldUseDespiaOAuth(provider)) {
    if (provider === 'google') {
      return tryDespiaGoogleOAuth();
    }
    // Apple on Android Despia — fall through to Firebase redirect in WebView is blocked;
    // use popup attempt only as last resort (Despia iOS Apple uses WebKit below).
  }

  if (shouldUseNativeOAuth() && !isDespiaRuntime()) {
    const nativeResult = await tryCapacitorNativeOAuth(provider);
    if (nativeResult && !nativeResult.error && nativeResult.data.session?.user) {
      return nativeResult;
    }
    if (nativeResult?.error && !isRetryableNativeError(nativeResult.error)) {
      return nativeResult;
    }
    // Self-built Capacitor without plugin — use redirect rather than popup in WebView.
    const { firebaseAuth } = await import('@/lib/firebase');
    const baseOpts =
      provider === 'google'
        ? { extraParams: { prompt: 'select_account' as const }, useRedirect: true }
        : { useRedirect: true };
    return firebaseAuth.signInWithOAuth(provider, baseOpts);
  }

  if (isDespiaRuntime() && provider === 'apple') {
    const { firebaseAuth } = await import('@/lib/firebase');
    return firebaseAuth.signInWithOAuth(provider, { useRedirect: false });
  }

  const useRedirect = shouldUseRedirectOAuth();
  const { firebaseAuth } = await import('@/lib/firebase');
  const baseOpts =
    provider === 'google'
      ? { extraParams: { prompt: 'select_account' as const }, useRedirect }
      : { useRedirect };

  let oauthResult = await firebaseAuth.signInWithOAuth(provider, baseOpts);
  if (oauthResult.redirected) return oauthResult;

  if (
    oauthResult.error &&
    !useRedirect &&
    (oauthResult.error.name === 'auth/popup-blocked' ||
      oauthResult.error.name === 'auth/popup-closed-by-user')
  ) {
    oauthResult = await firebaseAuth.signInWithOAuth(provider, { ...baseOpts, useRedirect: true });
  }

  return oauthResult;
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
