/**
 * Despia native OAuth — opens ASWebAuthenticationSession / Chrome Custom Tabs
 * via `oauth://`, then completes Firebase sign-in in the WebView from deeplink tokens.
 */
import { GoogleAuthProvider, OAuthProvider, signInWithCredential, signInWithCustomToken } from 'firebase/auth';
import { despiaCall, isDespiaRuntime } from '@/lib/despiaBridge';
import { getProductionOrigin } from '@/lib/authRedirect';
import { isNativePlatform } from '@/lib/capacitor';
import type { VybeAuthError, VybeSession } from '@/lib/firebase/types';

const DESPIA_OAUTH_PENDING_KEY = 'vybe-despia-oauth-pending';
const DESPIA_OAUTH_PENDING_AT_KEY = 'vybe-despia-oauth-pending-at';
const DESPIA_OAUTH_PROVIDER_KEY = 'vybe-despia-oauth-provider';
const DESPIA_OAUTH_NONCE_KEY = 'vybe-despia-oauth-nonce';
const DESPIA_OAUTH_PENDING_MAX_MS = 3 * 60 * 1000;
/** Globals Despia may set when ASWeb returns the oauth/ deeplink. */
const DESPIA_OAUTH_URL_KEYS = ['url', 'oauthUrl', 'deeplink', 'deepLink'] as const;

let noncePollTimer: number | null = null;
let noncePollGeneration = 0;

function stopDespiaOAuthNoncePoll(): void {
  noncePollGeneration += 1;
  if (typeof window === 'undefined') return;
  if (noncePollTimer != null) {
    window.clearTimeout(noncePollTimer);
    noncePollTimer = null;
  }
}

/** Firebase web client ID (public) — matches native/android/google-services.json */
const DEFAULT_GOOGLE_WEB_CLIENT_ID =
  '728651793473-71p1iahdr79ali0o7en8ktirklfjf3pf.apps.googleusercontent.com';

/** Apple Services ID (web) — must match Firebase Auth Apple provider + Apple Developer return URLs. */
const DEFAULT_APPLE_SERVICES_ID = 'com.despia.vybe.web';

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

function encodeOAuthState(payload: {
  scheme: string;
  nonce: string;
  provider: string;
  cv?: string;
}): string {
  return btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeOAuthState(
  state: string | null,
): { scheme: string; nonce: string; provider: string; cv?: string } | null {
  if (!state) return null;
  try {
    const padded = state.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
    const parsed = JSON.parse(json) as {
      scheme?: string;
      nonce?: string;
      provider?: string;
      cv?: string;
    };
    if (!parsed.scheme || !parsed.nonce || !parsed.provider) return null;
    return {
      scheme: parsed.scheme,
      nonce: parsed.nonce,
      provider: parsed.provider,
      cv: typeof parsed.cv === 'string' ? parsed.cv : undefined,
    };
  } catch {
    return null;
  }
}

export function markDespiaOAuthPending(provider?: 'google' | 'apple'): void {
  if (typeof window === 'undefined') return;
  const at = String(Date.now());
  sessionStorage.setItem(DESPIA_OAUTH_PENDING_KEY, 'true');
  sessionStorage.setItem(DESPIA_OAUTH_PENDING_AT_KEY, at);
  if (provider) sessionStorage.setItem(DESPIA_OAUTH_PROVIDER_KEY, provider);
  try {
    localStorage.setItem(DESPIA_OAUTH_PENDING_KEY, 'true');
    localStorage.setItem(DESPIA_OAUTH_PENDING_AT_KEY, at);
    if (provider) localStorage.setItem(DESPIA_OAUTH_PROVIDER_KEY, provider);
  } catch {
    /* ignore */
  }
}

export function getDespiaOAuthPendingProvider(): 'google' | 'apple' | null {
  if (typeof window === 'undefined') return null;
  const raw =
    sessionStorage.getItem(DESPIA_OAUTH_PROVIDER_KEY) ||
    (() => {
      try {
        return localStorage.getItem(DESPIA_OAUTH_PROVIDER_KEY);
      } catch {
        return null;
      }
    })();
  if (raw === 'google' || raw === 'apple') return raw;
  return null;
}

/** Resume nonce poll after Landing remount while OAuth sheet may still be finishing. */
export function resumeDespiaOAuthNoncePollIfPending(): void {
  if (typeof window === 'undefined' || !isDespiaOAuthInFlight()) return;
  const nonce = sessionStorage.getItem(DESPIA_OAUTH_NONCE_KEY);
  if (nonce) startDespiaOAuthNoncePoll(nonce);
}

export function clearDespiaOAuthPending(): void {
  if (typeof window === 'undefined') return;
  stopDespiaOAuthNoncePoll();
  sessionStorage.removeItem(DESPIA_OAUTH_PENDING_KEY);
  sessionStorage.removeItem(DESPIA_OAUTH_PENDING_AT_KEY);
  sessionStorage.removeItem(DESPIA_OAUTH_PROVIDER_KEY);
  sessionStorage.removeItem(DESPIA_OAUTH_NONCE_KEY);
  try {
    localStorage.removeItem(DESPIA_OAUTH_PENDING_KEY);
    localStorage.removeItem(DESPIA_OAUTH_PENDING_AT_KEY);
    localStorage.removeItem(DESPIA_OAUTH_PROVIDER_KEY);
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

/** Google Despia callback — production domain so the sheet shows vybehub.app. */
export function getGoogleOAuthCallbackUrl(): string {
  return `${getProductionOrigin()}/native-callback.html`;
}

export function buildGoogleOAuthUrl(): string {
  const scheme = getDespiaDeeplinkScheme();
  const nonce = randomNonce();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(DESPIA_OAUTH_NONCE_KEY, nonce);
  }

  // id_token (implicit) — no client_secret required. PKCE code exchange against
  // the Firebase web client fails with "client_secret is missing".
  const state = encodeOAuthState({ scheme, nonce, provider: 'google' });
  const redirectUri = getGoogleOAuthCallbackUrl();
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

function getAppleServicesId(): string {
  const fromEnv = import.meta.env.VITE_APPLE_SERVICES_ID;
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
  return DEFAULT_APPLE_SERVICES_ID;
}

/** Apple authorize URL for Despia ASWebAuthenticationSession (Android). */
export function getAppleOAuthCallbackUrl(): string {
  // Same static page as Google. Do NOT use /apple-callback Cloud Function —
  // that path hit Cloud Run CPU quota (503) and left users spinning forever.
  return getNativeOAuthCallbackUrl();
}

export function buildAppleOAuthUrl(): string {
  const scheme = getDespiaDeeplinkScheme();
  const nonce = randomNonce();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(DESPIA_OAUTH_NONCE_KEY, nonce);
  }

  const state = encodeOAuthState({ scheme, nonce, provider: 'apple' });
  const redirectUri = getAppleOAuthCallbackUrl();
  // Apple requires form_post when name/email scopes are requested. form_post
  // needs a server POST handler; ours is quota-starved. Omit name/email so
  // fragment + native-callback.html works (same handoff as Google). Email still
  // arrives in the id_token for first-time Apple consent in most cases.
  const params = new URLSearchParams({
    client_id: getAppleServicesId(),
    redirect_uri: redirectUri,
    response_type: 'id_token',
    response_mode: 'fragment',
    nonce,
    state,
  });

  return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
}

async function launchDespiaOAuthUrl(
  authUrl: string,
  provider: 'google' | 'apple',
): Promise<{
  pending: boolean;
  error: VybeAuthError | null;
}> {
  if (!isDespiaRuntime()) {
    return { pending: false, error: { message: 'Despia OAuth is only available in the native app' } };
  }

  try {
    markDespiaOAuthPending(provider);
    const oauthNonce =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(DESPIA_OAUTH_NONCE_KEY) : null;
    if (oauthNonce) startDespiaOAuthNoncePoll(oauthNonce);

    const oauthBridge = `oauth://?url=${encodeURIComponent(authUrl)}`;
    // Fire-and-forget launch; completion via deeplink AND/OR nonce poll (authQr).
    // Nonce poll logs the user in even when Despia never reinjects the deeplink.
    void despiaCall(oauthBridge, [...DESPIA_OAUTH_URL_KEYS], 90_000).then((payload) => {
      if (!payload) {
        // CCT dismissed without reinjecting a deeplink — keep nonce poll alive.
        // Landing's 45s chip timeout clears abandon; do not kill pending here.
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          resumeDespiaOAuthNoncePollIfPending();
          if (isDespiaOAuthReturnUrl(window.location.href)) {
            void tryCompleteDespiaOAuthFromCurrentUrl().then((result) => {
              if (result && (result.data.session?.user || result.error)) {
                window.dispatchEvent(new CustomEvent('despia-oauth-complete', { detail: result }));
              }
            });
          }
        }
        return;
      }

      for (const key of DESPIA_OAUTH_URL_KEYS) {
        const value = payload[key];
        const asUrl =
          typeof value === 'string'
            ? value
            : value && typeof value === 'object' && 'url' in value
              ? String((value as { url?: string }).url || '')
              : '';
        if (asUrl && isDespiaOAuthReturnUrl(asUrl)) {
          void completeDespiaOAuthFromUrl(asUrl).then((result) => {
            window.dispatchEvent(new CustomEvent('despia-oauth-complete', { detail: result }));
          });
          return;
        }
      }
    });
    return { pending: true, error: null };
  } catch (err) {
    clearDespiaOAuthPending();
    const message = err instanceof Error ? err.message : 'Failed to open sign-in';
    return { pending: false, error: { message, name: 'despia/oauth-launch-failed' } };
  }
}

/** Launch Google OAuth in Despia secure browser session. Completes asynchronously via deeplink. */
export async function signInWithGoogleDespia(): Promise<{
  pending: boolean;
  error: VybeAuthError | null;
}> {
  return launchDespiaOAuthUrl(buildGoogleOAuthUrl(), 'google');
}

/**
 * Apple on Despia:
 * - iOS → Apple JS SDK (native Face ID / system sheet — not a full Safari page)
 * - Android → oauth:// ASWebAuthenticationSession (no native Apple support)
 */
export async function signInWithAppleDespia(): Promise<{
  pending: boolean;
  error: VybeAuthError | null;
  data?: { session: VybeSession | null };
}> {
  const { isAndroidAppShell, getRuntimeOs } = await import('@/lib/despiaBridge');
  const os = getRuntimeOs();

  if (isAndroidAppShell() || os === 'android') {
    return launchDespiaOAuthUrl(buildAppleOAuthUrl(), 'apple');
  }

  const { signInWithAppleJsSdk } = await import('@/lib/appleSignIn');
  const js = await signInWithAppleJsSdk();
  if (js.error) return { pending: false, error: js.error, data: { session: null } };
  return { pending: false, error: null, data: { session: js.data.session } };
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
  const params = parseOAuthParamsFromUrl(url);
  if (
    params.has('hc') ||
    params.has('handoff_code') ||
    params.has('custom_token') ||
    params.has('customToken') ||
    params.has('id_token') ||
    params.has('error') ||
    (params.has('nonce') && (params.has('wait') || params.get('wait') === '1'))
  ) {
    return true;
  }
  const lower = url.toLowerCase();
  return (lower.includes('oauth/auth') || lower.includes('oauth%2fauth')) && params.toString().length > 0;
}

async function redeemOAuthHandoffCode(code: string): Promise<{
  customToken?: string;
  idToken?: string;
  nonce?: string;
  provider?: string;
}> {
  const { invokeFunction } = await import('@/lib/firebase/functionsService');
  const { data, error } = await invokeFunction<{
    customToken?: string;
    custom_token?: string;
    idToken?: string;
    id_token?: string;
    nonce?: string;
    provider?: string;
  }>('authQr', { action: 'redeem_oauth_code', code });
  if (error || !data) {
    throw Object.assign(new Error(error?.message || 'OAuth code redeem failed'), {
      code: error?.name || 'despia/oauth-redeem-failed',
    });
  }
  return {
    customToken: data.customToken || data.custom_token || undefined,
    idToken: data.idToken || data.id_token || undefined,
    nonce: data.nonce || undefined,
    provider: data.provider || undefined,
  };
}

/**
 * Poll authQr for a handoff stashed under the OAuth nonce.
 * This logs the user in even when Despia never reinjects the deeplink into the WebView.
 * Android Custom Tabs throttle background WebView timers — poll harder when visible.
 */
function startDespiaOAuthNoncePoll(nonce: string): void {
  if (typeof window === 'undefined') return;
  const clean = nonce.trim().toLowerCase();
  if (!/^[a-f0-9]{16,64}$/i.test(clean)) return;

  stopDespiaOAuthNoncePoll();
  const generation = noncePollGeneration;
  const startedAt = Date.now();
  const maxMs = 90_000;

  const tick = async () => {
    if (generation !== noncePollGeneration) return;
    if (!isDespiaOAuthInFlight()) {
      stopDespiaOAuthNoncePoll();
      return;
    }
    if (Date.now() - startedAt > maxMs) {
      stopDespiaOAuthNoncePoll();
      return;
    }

    try {
      const { invokeFunction } = await import('@/lib/firebase/functionsService');
      const { data } = await invokeFunction<{
        ready?: boolean;
        code?: string;
        provider?: string | null;
      }>('authQr', { action: 'poll_oauth_nonce', nonce: clean });

      if (generation !== noncePollGeneration) return;

      if (data?.ready && data.code) {
        // #region agent log
        fetch('http://127.0.0.1:7693/ingest/1847f3ab-7d03-4b99-8dbe-84076ae9145e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bd2545'},body:JSON.stringify({sessionId:'bd2545',runId:'pre-fix',hypothesisId:'E',location:'despiaOAuth.ts:pollReady',message:'poll_ready',data:{nonceLen:clean.length,codeLen:String(data.code).length,visible:typeof document!=='undefined'?document.visibilityState:'na'},timestamp:Date.now()})}).catch(()=>{});
        void import('@/lib/firebase/functionsService').then(({ invokeFunction }) =>
          invokeFunction('authQr', {
            action: 'debug_oauth',
            event: 'poll_ready',
            hypothesisId: 'E',
            location: 'despiaOAuth.ts:pollReady',
            payload: {
              nonceLen: clean.length,
              codeLen: String(data.code).length,
              visible: typeof document !== 'undefined' ? document.visibilityState : 'na',
            },
          }).catch(() => null),
        );
        // #endregion
        stopDespiaOAuthNoncePoll();
        const state = encodeOAuthState({
          scheme: getDespiaDeeplinkScheme(),
          nonce: clean,
          provider: (data.provider as string) || 'google',
        });
        const synthetic = `${window.location.origin}/auth?hc=${encodeURIComponent(data.code)}&state=${encodeURIComponent(state)}`;
        const result = await completeDespiaOAuthFromUrl(synthetic);
        window.dispatchEvent(new CustomEvent('despia-oauth-complete', { detail: result }));
        return;
      }
    } catch {
      /* keep polling */
    }

    if (generation === noncePollGeneration) {
      const visible = typeof document !== 'undefined' && document.visibilityState === 'visible';
      const delay = visible ? 250 : 500;
      noncePollTimer = window.setTimeout(() => {
        void tick();
      }, delay);
    }
  };

  noncePollTimer = window.setTimeout(() => {
    void tick();
  }, 100);

  // When CCT dismisses, WebView timers unthrottle — poll immediately.
  const onVisible = () => {
    if (generation !== noncePollGeneration) return;
    if (document.visibilityState !== 'visible') return;
    if (!isDespiaOAuthInFlight()) return;
    if (noncePollTimer != null) {
      window.clearTimeout(noncePollTimer);
      noncePollTimer = null;
    }
    void tick();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  // Drop listeners when this poll generation ends (next stop/start bumps generation).
  const watchStop = window.setInterval(() => {
    if (generation !== noncePollGeneration) {
      window.clearInterval(watchStop);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    }
  }, 1000);
}

/** Complete Firebase sign-in from Despia deeplink or /auth?custom_token=... / id_token return. */
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

  const handoffCode = (params.get('hc') || params.get('handoff_code') || '').trim();
  let customToken = params.get('custom_token') || params.get('customToken');
  let idToken = params.get('id_token');
  let redeemedNonce: string | undefined;
  let redeemedProvider: string | undefined;

  if (handoffCode) {
    try {
      const redeemed = await redeemOAuthHandoffCode(handoffCode);
      customToken = redeemed.customToken || customToken;
      idToken = redeemed.idToken || idToken;
      redeemedNonce = redeemed.nonce;
      redeemedProvider = redeemed.provider;
    } catch (err) {
      // Parallel deeplink + nonce-poll can race: first redeem wins, second is not-found.
      try {
        const { firebaseAuth } = await import('@/lib/firebase');
        if (firebaseAuth.auth?.currentUser) {
          const { data } = await firebaseAuth.getSession();
          if (data.session?.user) {
            clearDespiaOAuthPending();
            return { data: { session: data.session }, error: null };
          }
        }
      } catch {
        /* ignore */
      }
      clearDespiaOAuthPending();
      const message = err instanceof Error ? err.message : 'OAuth code redeem failed';
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code)
          : 'despia/oauth-redeem-failed';
      return { data: { session: null }, error: { message, name: code } };
    }
  }

  if (!customToken && !idToken) {
    clearDespiaOAuthPending();
    return {
      data: { session: null },
      error: {
        message: 'Sign-in was cancelled or incomplete.',
        name: 'auth/popup-closed-by-user',
      },
    };
  }

  const state = decodeOAuthState(params.get('state'));
  const storedNonce =
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(DESPIA_OAUTH_NONCE_KEY) : null;

  // Handoff codes already bind nonce server-side — skip strict client mismatch for hc=.
  if (!handoffCode && state && storedNonce && state.nonce !== storedNonce) {
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

    const providerHint = redeemedProvider || state?.provider || 'google';

    if (customToken) {
      // Short handoff → custom token (preferred — avoids long deeplinks).
      await signInWithCustomToken(auth, customToken);
    } else if (providerHint === 'apple') {
      const apple = new OAuthProvider('apple.com');
      const credential = apple.credential({
        idToken: idToken!,
        rawNonce: redeemedNonce || storedNonce || state?.nonce || undefined,
      });
      await signInWithCredential(auth, credential);
    } else {
      const credential = GoogleAuthProvider.credential(idToken!);
      await signInWithCredential(auth, credential);
    }
    clearDespiaOAuthPending();

    const { data, error: sessionError } = await firebaseAuth.getSession();
    if (sessionError) {
      return { data: { session: null }, error: sessionError };
    }
    const completion = { data: { session: data.session }, error: null };
    if (data.session?.user) {
      try {
        const cleanPath = window.location.pathname || '/auth';
        window.history.replaceState({}, '', cleanPath);
      } catch {
        /* ignore */
      }
      try {
        const { claimProfileAfterOAuth } = await import('@/lib/oauthAccountLink');
        await claimProfileAfterOAuth();
      } catch {
        /* optional */
      }
      window.dispatchEvent(new CustomEvent('despia-oauth-complete', { detail: completion }));
    }
    return completion;
  } catch (err) {
    clearDespiaOAuthPending();
    const { mapOAuthLinkError } = await import('@/lib/oauthAccountLink');
    return { data: { session: null }, error: mapOAuthLinkError(err) };
  }
}

/** Handle Despia OAuth deeplink on app boot or resume. */
export async function tryCompleteDespiaOAuthFromCurrentUrl(): Promise<DespiaOAuthCompletion | null> {
  if (typeof window === 'undefined') return null;
  const href = window.location.href;
  if (!isDespiaOAuthReturnUrl(href) && !isDespiaOAuthInFlight()) return null;

  const params = parseOAuthParamsFromUrl(href);
  const waitNonce = (params.get('nonce') || '').trim();
  const waiting = params.get('wait') === '1' || params.has('wait');

  // Instant sheet-close path: nonce is ready, handoff still stashing — poll then sign in.
  if (waiting && waitNonce && !params.has('hc') && !params.has('id_token') && !params.has('error')) {
    const providerHint = (params.get('provider') || 'google') as 'google' | 'apple';
    markDespiaOAuthPending(providerHint === 'apple' ? 'apple' : 'google');
    try {
      sessionStorage.setItem(DESPIA_OAUTH_NONCE_KEY, waitNonce);
    } catch {
      /* ignore */
    }
    startDespiaOAuthNoncePoll(waitNonce);
    try {
      const cleanPath = window.location.pathname || '/auth';
      window.history.replaceState({}, '', cleanPath);
    } catch {
      /* ignore */
    }
    return null;
  }

  if (
    !params.has('hc') &&
    !params.has('handoff_code') &&
    !params.has('custom_token') &&
    !params.has('customToken') &&
    !params.has('id_token') &&
    !params.has('error')
  ) {
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
    // wait=1 nonce path starts poll without a session yet.
    void tryCompleteDespiaOAuthFromCurrentUrl().then((result) => {
      if (!result) return;
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
    // Also try direct complete for hc= / token URLs (may be the event href, not location yet).
    if (/[?&#](hc|id_token|custom_token)=/.test(url)) {
      void completeDespiaOAuthFromUrl(url).then((result) => {
        if (result.data.session?.user || result.error) {
          window.dispatchEvent(new CustomEvent('despia-oauth-complete', { detail: result }));
        }
      });
    }
  };

  const tryCurrent = () => {
    if (isDespiaOAuthReturnUrl(window.location.href)) {
      handleUrl(window.location.href);
      return;
    }
    // Despia may inject the return URL onto window globals after ASWeb closes.
    if (!isDespiaOAuthInFlight()) return;
    const w = window as unknown as Record<string, unknown>;
    for (const key of DESPIA_OAUTH_URL_KEYS) {
      const value = w[key];
      const asUrl =
        typeof value === 'string'
          ? value
          : value && typeof value === 'object' && value !== null && 'url' in value
            ? String((value as { url?: string }).url || '')
            : '';
      if (asUrl && isDespiaOAuthReturnUrl(asUrl)) {
        handleUrl(asUrl);
        return;
      }
    }
  };

  tryCurrent();

  window.addEventListener('popstate', tryCurrent);
  window.addEventListener('hashchange', tryCurrent);
  window.addEventListener('pageshow', tryCurrent);
  window.addEventListener('focus', tryCurrent);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tryCurrent();
  });
  document.addEventListener('app-resumed', tryCurrent);
}
