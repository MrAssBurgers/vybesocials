/**
 * Despia native OAuth — opens ASWebAuthenticationSession / Chrome Custom Tabs
 * via `oauth://`, then completes Firebase sign-in in the WebView from deeplink tokens.
 */
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { despiaCall, isDespiaRuntime } from '@/lib/despiaBridge';
import { getProductionOrigin } from '@/lib/authRedirect';
import { isNativePlatform } from '@/lib/capacitor';
import type { VybeAuthError, VybeSession } from '@/lib/firebase/types';

const DESPIA_OAUTH_PENDING_KEY = 'vybe-despia-oauth-pending';
const DESPIA_OAUTH_PENDING_AT_KEY = 'vybe-despia-oauth-pending-at';
const DESPIA_OAUTH_NONCE_KEY = 'vybe-despia-oauth-nonce';
const DESPIA_OAUTH_PENDING_MAX_MS = 3 * 60 * 1000;

/** Firebase web client ID (public) — matches native/android/google-services.json */
const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '728651793473-71p1iahdr79ali0o7en8ktirklfjf3pf.apps.googleusercontent.com';

export type DespiaOAuthCompletion = {
  data: { session: VybeSession | null };
  error: VybeAuthError | null;
};

export function getDespiaDeeplinkScheme(): string {
  const fromEnv = import.meta.env.VITE_DESPIA_DEEPLINK_SCHEME;
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
  return 'com.despia.vybe';
}

function getGoogleWebClientId(): string {
  const fromEnv = import.meta.env.VITE_FIREBASE_GOOGLE_WEB_CLIENT_ID;
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
  return DEFAULT_GOOGLE_WEB_CLIENT_ID;
}

export function getNativeOAuthCallbackUrl(): string {
  return `${getProductionOrigin()}/native-callback.html`;
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function encodeOAuthState(payload: { scheme: string; nonce: string; provider: string }): string {
  return btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeOAuthState(state: string | null): { scheme: string; nonce: string; provider: string } | null {
  if (!state) return null;
  try {
    const padded = state.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
    const parsed = JSON.parse(json) as { scheme?: string; nonce?: string; provider?: string };
    if (!parsed.scheme || !parsed.nonce || !parsed.provider) return null;
    return { scheme: parsed.scheme, nonce: parsed.nonce, provider: parsed.provider };
  } catch {
    return null;
  }
}

export function markDespiaOAuthPending(): void {
  if (typeof window === 'undefined') return;
  const at = String(Date.now());
  sessionStorage.setItem(DESPIA_OAUTH_PENDING_KEY, 'true');
  sessionStorage.setItem(DESPIA_OAUTH_PENDING_AT_KEY, at);
  try {
    localStorage.setItem(DESPIA_OAUTH_PENDING_KEY, 'true');
    localStorage.setItem(DESPIA_OAUTH_PENDING_AT_KEY, at);
  } catch {
    /* ignore */
  }
}

export function clearDespiaOAuthPending(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(DESPIA_OAUTH_PENDING_KEY);
  sessionStorage.removeItem(DESPIA_OAUTH_PENDING_AT_KEY);
  sessionStorage.removeItem(DESPIA_OAUTH_NONCE_KEY);
  try {
    localStorage.removeItem(DESPIA_OAUTH_PENDING_KEY);
    localStorage.removeItem(DESPIA_OAUTH_PENDING_AT_KEY);
  } catch {
    /* ignore */
  }
}

export function clearStaleDespiaOAuthPending(): void {
  if (typeof window === 'undefined') return;
  const pending =
    sessionStorage.getItem(DESPIA_OAUTH_PENDING_KEY) === 'true' ||
    (() => {
      try {
        return localStorage.getItem(DESPIA_OAUTH_PENDING_KEY) === 'true';
      } catch {
        return false;
      }
    })();
  if (!pending) return;
  const at =
    Number(sessionStorage.getItem(DESPIA_OAUTH_PENDING_AT_KEY) || '0') ||
    (() => {
      try {
        return Number(localStorage.getItem(DESPIA_OAUTH_PENDING_AT_KEY) || '0');
      } catch {
        return 0;
      }
    })();
  if (!at || Date.now() - at > DESPIA_OAUTH_PENDING_MAX_MS) {
    clearDespiaOAuthPending();
  }
}

export function isDespiaOAuthInFlight(): boolean {
  if (typeof window === 'undefined') return false;
  const pending =
    sessionStorage.getItem(DESPIA_OAUTH_PENDING_KEY) === 'true' ||
    (() => {
      try {
        return localStorage.getItem(DESPIA_OAUTH_PENDING_KEY) === 'true';
      } catch {
        return false;
      }
    })();
  if (!pending) return false;
  const at =
    Number(sessionStorage.getItem(DESPIA_OAUTH_PENDING_AT_KEY) || '0') ||
    (() => {
      try {
        return Number(localStorage.getItem(DESPIA_OAUTH_PENDING_AT_KEY) || '0');
      } catch {
        return 0;
      }
    })();
  if (at && Date.now() - at > DESPIA_OAUTH_PENDING_MAX_MS) {
    clearDespiaOAuthPending();
    return false;
  }
  return true;
}

export function buildGoogleOAuthUrl(): string {
  const scheme = getDespiaDeeplinkScheme();
  const nonce = randomNonce();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(DESPIA_OAUTH_NONCE_KEY, nonce);
  }

  const state = encodeOAuthState({ scheme, nonce, provider: 'google' });
  const redirectUri = getNativeOAuthCallbackUrl();
  const clientId = getGoogleWebClientId();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce,
    state,
    prompt: 'select_account',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Launch Google OAuth in Despia secure browser session. Completes asynchronously via deeplink. */
export async function signInWithGoogleDespia(): Promise<{
  pending: boolean;
  error: VybeAuthError | null;
}> {
  if (!isDespiaRuntime()) {
    return { pending: false, error: { message: 'Despia OAuth is only available in the native app' } };
  }

  try {
    markDespiaOAuthPending();
    const authUrl = buildGoogleOAuthUrl();
    const oauthBridge = `oauth://?url=${encodeURIComponent(authUrl)}`;
    await despiaCall(oauthBridge);
    return { pending: true, error: null };
  } catch (err) {
    clearDespiaOAuthPending();
    const message = err instanceof Error ? err.message : 'Failed to open Google sign-in';
    return { pending: false, error: { message, name: 'despia/oauth-launch-failed' } };
  }
}

function parseOAuthParamsFromUrl(url: string): URLSearchParams {
  try {
    const parsed = new URL(url, window.location.origin);
    const fromSearch = new URLSearchParams(parsed.search);
    if (parsed.hash && parsed.hash.length > 1) {
      const hashParams = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash);
      hashParams.forEach((value, key) => fromSearch.set(key, value));
    }
    return fromSearch;
  } catch {
    return new URLSearchParams();
  }
}

export function isDespiaOAuthReturnUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes('oauth/auth') || lower.includes('oauth%2fauth')) return true;
  const params = parseOAuthParamsFromUrl(url);
  return params.has('id_token') || (params.has('error') && params.has('state'));
}

/** Complete Firebase sign-in from Despia deeplink or /auth?id_token=... return. */
export async function completeDespiaOAuthFromUrl(url: string): Promise<DespiaOAuthCompletion> {
  const params = parseOAuthParamsFromUrl(url);
  const error = params.get('error');
  const errorDescription = params.get('error_description');

  if (error) {
    clearDespiaOAuthPending();
    if (error === 'access_denied') {
      return { data: { session: null }, error: { message: 'Sign-in cancelled', name: 'auth/popup-closed-by-user' } };
    }
    return {
      data: { session: null },
      error: { message: errorDescription || error, name: 'despia/oauth-error' },
    };
  }

  const idToken = params.get('id_token');
  if (!idToken) {
    return { data: { session: null }, error: null };
  }

  const state = decodeOAuthState(params.get('state'));
  const storedNonce =
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(DESPIA_OAUTH_NONCE_KEY) : null;

  if (state && storedNonce && state.nonce !== storedNonce) {
    clearDespiaOAuthPending();
    return { data: { session: null }, error: { message: 'OAuth session mismatch — please try again' } };
  }

  try {
    const { firebaseAuth } = await import('@/lib/firebase');
    const auth = firebaseAuth.auth;
    if (!auth) {
      clearDespiaOAuthPending();
      return { data: { session: null }, error: { message: 'Firebase is not configured', name: 'firebase/not-configured' } };
    }

    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, credential);
    clearDespiaOAuthPending();

    const { data, error: sessionError } = await firebaseAuth.getSession();
    if (sessionError) {
      return { data: { session: null }, error: sessionError };
    }
    const completion = { data: { session: data.session }, error: null };
    if (data.session?.user) {
      window.dispatchEvent(new CustomEvent('despia-oauth-complete', { detail: completion }));
    }
    return completion;
  } catch (err) {
    clearDespiaOAuthPending();
    const message = err instanceof Error ? err.message : 'Google sign-in failed';
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : undefined;
    return { data: { session: null }, error: { message, name: code } };
  }
}

/** Handle Despia OAuth deeplink on app boot or resume. */
export async function tryCompleteDespiaOAuthFromCurrentUrl(): Promise<DespiaOAuthCompletion | null> {
  if (typeof window === 'undefined') return null;
  const href = window.location.href;
  if (!isDespiaOAuthReturnUrl(href) && !isDespiaOAuthInFlight()) return null;

  const params = parseOAuthParamsFromUrl(href);
  if (!params.has('id_token') && !params.has('error')) {
    if (!isDespiaOAuthInFlight()) return null;
    return null;
  }

  return completeDespiaOAuthFromUrl(href);
}

/** Initialize Despia OAuth deeplink listener (works outside Capacitor). */
export function initDespiaOAuthDeepLinkHandler(): void {
  if (typeof window === 'undefined' || (!isDespiaRuntime() && !isNativePlatform)) return;

  const handleUrl = (url: string) => {
    if (!isDespiaOAuthReturnUrl(url)) return;
    void completeDespiaOAuthFromUrl(url).then((result) => {
      if (result.error) {
        sessionStorage.setItem('vybe-oauth-error', result.error.message);
      }
      if (result.data.session?.user || result.error) {
        try {
          const cleanPath = window.location.pathname || '/auth';
          window.history.replaceState({}, '', cleanPath);
        } catch {
          /* ignore */
        }
        window.dispatchEvent(new CustomEvent('despia-oauth-complete', { detail: result }));
      }
    });
  };

  // Despia may inject the return URL into window location or bridge globals.
  if (isDespiaOAuthReturnUrl(window.location.href)) {
    handleUrl(window.location.href);
  }

  window.addEventListener('popstate', () => {
    if (isDespiaOAuthReturnUrl(window.location.href)) {
      handleUrl(window.location.href);
    }
  });

  document.addEventListener('app-resumed', () => {
    if (isDespiaOAuthReturnUrl(window.location.href)) {
      handleUrl(window.location.href);
    }
  });
}
