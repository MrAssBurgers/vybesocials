/**
 * Platform-aware OAuth — native picker on Despia/Capacitor, popup on desktop,
 * redirect on mobile Safari only (never redirect inside native app shells).
 */
import { isNativeAppShell } from '@/lib/despiaBridge';
import { isDesktopWebBrowser } from '@/lib/deviceDetection';
import { isNativePlatform } from '@/lib/capacitor';
import type { VybeAuthError, VybeSession } from '@/lib/firebase/types';

export type OAuthProviderId = 'google' | 'apple';

export type OAuthSignInResult = {
  data: { session: VybeSession | null };
  error: VybeAuthError | null;
  redirected?: boolean;
};

export function shouldUseNativeOAuth(): boolean {
  return isNativeAppShell();
}

export function shouldUseRedirectOAuth(): boolean {
  if (isNativeAppShell()) return false;
  return !isDesktopWebBrowser();
}

async function tryCapacitorNativeOAuth(provider: OAuthProviderId): Promise<OAuthSignInResult | null> {
  if (!isNativePlatform) return null;
  try {
    const { firebaseAuth } = await import('@/lib/firebase');
    return firebaseAuth.signInWithOAuthNative(provider);
  } catch {
    return null;
  }
}

/** Despia WebView without Capacitor native module — popup beats Safari redirect. */
async function tryNativeShellPopupFallback(
  provider: OAuthProviderId,
): Promise<OAuthSignInResult> {
  const { firebaseAuth } = await import('@/lib/firebase');
  const baseOpts =
    provider === 'google'
      ? { extraParams: { prompt: 'select_account' as const }, useRedirect: false }
      : { useRedirect: false };
  return firebaseAuth.signInWithOAuth(provider, baseOpts);
}

export async function signInWithOAuthPlatform(provider: OAuthProviderId): Promise<OAuthSignInResult> {
  if (shouldUseNativeOAuth()) {
    const nativeResult = await tryCapacitorNativeOAuth(provider);
    if (nativeResult && !nativeResult.error && nativeResult.data.session?.user) {
      return nativeResult;
    }
    if (nativeResult?.error && !isRetryableNativeError(nativeResult.error)) {
      return nativeResult;
    }
    return tryNativeShellPopupFallback(provider);
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
