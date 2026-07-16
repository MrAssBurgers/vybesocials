/**
 * Despia native OAuth — opens ASWebAuthenticationSession / Chrome Custom Tabs
 * via `oauth://`, then completes Firebase sign-in in the WebView from deeplink tokens.
 */
import { GoogleAuthProvider, OAuthProvider, linkWithCredential, signInWithCredential, signInWithCustomToken } from 'firebase/auth';
import { despiaCall, getRuntimeOs, isDespiaRuntime } from '@/lib/despiaBridge';
import { debugSessionLog } from '@/lib/debugSessionLog';
import { getProductionOrigin } from '@/lib/authRedirect';
import { isNativePlatform } from '@/lib/capacitor';
import type { VybeAuthError, VybeSession } from '@/lib/firebase/types';

const DESPIA_OAUTH_PENDING_KEY = 'vybe-despia-oauth-pending';
const DESPIA_OAUTH_PENDING_AT_KEY = 'vybe-despia-oauth-pending-at';
const DESPIA_OAUTH_PROVIDER_KEY = 'vybe-despia-oauth-provider';
const DESPIA_OAUTH_NONCE_KEY = 'vybe-despia-oauth-nonce';
const DESPIA_OAUTH_INTENT_KEY = 'vybe-despia-oauth-intent';
const DESPIA_OAUTH_PENDING_MAX_MS = 3 * 60 * 1000;
/** Globals Despia may set when ASWeb returns the oauth/ deeplink. */
const DESPIA_OAUTH_URL_KEYS = ['url', 'oauthUrl', 'deeplink', 'deepLink'] as const;

let noncePollTimer: number | null = null;
let noncePollGeneration = 0;
let sheetCancelTimer: number | null = null;
let sheetCancelGeneration = 0;

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
  data: { session: VybeSession | null; linked?: boolean };
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

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

function randomCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function encodeOAuthState(payload: {
  scheme: string;
  nonce: string;
  provider: string;
  cv?: string;
  intent?: 'signin' | 'link';
}): string {
  return btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeOAuthState(
  state: string | null,
): { scheme: string; nonce: string; provider: string; cv?: string; intent?: 'signin' | 'link' } | null {
  if (!state) return null;
  try {
    const padded = state.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
    const parsed = JSON.parse(json) as {
      scheme?: string;
      nonce?: string;
      provider?: string;
      cv?: string;
      intent?: string;
    };
    if (!parsed.scheme || !parsed.nonce || !parsed.provider) return null;
    return {
      scheme: parsed.scheme,
      nonce: parsed.nonce,
      provider: parsed.provider,
      cv: typeof parsed.cv === 'string' ? parsed.cv : undefined,
      intent: parsed.intent === 'link' ? 'link' : 'signin',
    };
  } catch {
    return null;
  }
}

export function markDespiaOAuthPending(
  provider?: 'google' | 'apple',
  intent: 'signin' | 'link' = 'signin',
): void {
  if (typeof window === 'undefined') return;
  const at = String(Date.now());
  sessionStorage.setItem(DESPIA_OAUTH_PENDING_KEY, 'true');
  sessionStorage.setItem(DESPIA_OAUTH_PENDING_AT_KEY, at);
  sessionStorage.setItem(DESPIA_OAUTH_INTENT_KEY, intent);
  if (provider) sessionStorage.setItem(DESPIA_OAUTH_PROVIDER_KEY, provider);
  try {
    localStorage.setItem(DESPIA_OAUTH_PENDING_KEY, 'true');
    localStorage.setItem(DESPIA_OAUTH_PENDING_AT_KEY, at);
    localStorage.setItem(DESPIA_OAUTH_INTENT_KEY, intent);
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
  sheetCancelGeneration += 1;
  if (sheetCancelTimer != null) {
    window.clearTimeout(sheetCancelTimer);
    sheetCancelTimer = null;
  }
  sessionStorage.removeItem(DESPIA_OAUTH_PENDING_KEY);
  sessionStorage.removeItem(DESPIA_OAUTH_PENDING_AT_KEY);
  sessionStorage.removeItem(DESPIA_OAUTH_PROVIDER_KEY);
  sessionStorage.removeItem(DESPIA_OAUTH_NONCE_KEY);
  sessionStorage.removeItem(DESPIA_OAUTH_INTENT_KEY);
  try {
    localStorage.removeItem(DESPIA_OAUTH_PENDING_KEY);
    localStorage.removeItem(DESPIA_OAUTH_PENDING_AT_KEY);
    localStorage.removeItem(DESPIA_OAUTH_PROVIDER_KEY);
    localStorage.removeItem(DESPIA_OAUTH_INTENT_KEY);
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

/** Google Despia callback — PKCE code flow via static vybehub.app page. */
export function getGoogleOAuthCallbackUrl(): string {
  return `${getProductionOrigin()}/google-callback.html`;
}

export async function buildGoogleOAuthUrl(intent: 'signin' | 'link' = 'signin'): Promise<string> {
  const scheme = getDespiaDeeplinkScheme();
  const nonce = randomNonce();
  const codeVerifier = randomCodeVerifier();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(DESPIA_OAUTH_NONCE_KEY, nonce);
  }

  const state = encodeOAuthState({ scheme, nonce, provider: 'google', intent, cv: codeVerifier });
  const redirectUri = getGoogleOAuthCallbackUrl();
  const clientId = getGoogleWebClientId();
  const codeChallenge = await sha256Base64Url(codeVerifier);

  // PKCE authorization-code flow — avoids id_token+nonce implicit errors in Custom Tabs.
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  // #region agent log
  debugSessionLog(
    'despiaOAuth.ts:buildGoogleOAuthUrl',
    'google_oauth_pkce_url',
    { intent, hasNonce: Boolean(nonce), hasCv: Boolean(codeVerifier), redirectUri },
    'H5',
  );
  // #endregion
  return url;
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

export async function buildAppleOAuthUrl(intent: 'signin' | 'link' = 'signin'): Promise<string> {
  const scheme = getDespiaDeeplinkScheme();
  const rawNonce = randomNonce();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(DESPIA_OAUTH_NONCE_KEY, rawNonce);
  }

  // Apple puts SHA256(rawNonce) into id_token.nonce. Firebase expects rawNonce
  // on credential creation and performs the SHA256 check itself.
  const hashedNonce = await sha256Hex(rawNonce);
  const state = encodeOAuthState({ scheme, nonce: rawNonce, provider: 'apple', intent });
  const redirectUri = getAppleOAuthCallbackUrl();
  // Apple rejects response_type=id_token alone. Space must be %20 — URLSearchParams
  // encodes as "+" which Apple treats as invalid_request / invalid response_type.
  const params = new URLSearchParams({
    client_id: getAppleServicesId(),
    redirect_uri: redirectUri,
    response_mode: 'fragment',
    nonce: hashedNonce,
    state,
  });
  const url =
    `https://appleid.apple.com/auth/authorize?${params.toString()}` +
    `&response_type=${encodeURIComponent('code id_token')}`;
  // #region agent log
  {
    const rtMatch = url.match(/response_type=([^&]+)/);
    const rt = rtMatch ? rtMatch[1] : '';
    void fetch('https://us-central1-vybe-daaab.cloudfunctions.net/authQr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          action: 'debug_oauth',
          event: 'apple_authorize_url',
          hypothesisId: 'B',
          location: 'despiaOAuth.ts:buildAppleOAuthUrl',
          payload: {
            responseTypeEnc: rt,
            hasPercent20: rt.includes('%20'),
            hasPlus: rt.includes('+'),
            intent,
            authorizeNonce: 'sha256(raw)',
          },
        },
      }),
      keepalive: true,
    }).catch(() => {});
  }
  // #endregion
  return url;
}

/** When the OAuth sheet is dismissed without tokens, stop polling and clear the chip. */
function armDespiaOAuthSheetCancelWatch(): void {
  if (typeof document === 'undefined') return;
  const generation = ++sheetCancelGeneration;
  let sawHidden = document.visibilityState === 'hidden';

  const tryCancel = () => {
    if (generation !== sheetCancelGeneration) return;
    if (!isDespiaOAuthInFlight()) return;
    if (isDespiaOAuthReturnUrl(window.location.href)) {
      void tryCompleteDespiaOAuthFromCurrentUrl().then((result) => {
        if (result && (result.data.session?.user || result.error)) {
          window.dispatchEvent(new CustomEvent('despia-oauth-complete', { detail: result }));
        }
      });
      return;
    }
    // Only cancel after the sheet actually hid (user opened then dismissed).
    if (!sawHidden) return;
    // Soft-close / exchange still running — nonce poll must stay alive.
    try {
      if (sessionStorage.getItem(DESPIA_OAUTH_NONCE_KEY)) return;
    } catch {
      /* ignore */
    }
    clearDespiaOAuthPending();
    window.dispatchEvent(
      new CustomEvent('despia-oauth-complete', {
        detail: {
          data: { session: null },
          error: { message: 'Sign-in cancelled', name: 'auth/popup-closed-by-user' },
        },
      }),
    );
  };

  const onVisible = () => {
    if (generation !== sheetCancelGeneration) return;
    if (document.visibilityState === 'hidden') {
      sawHidden = true;
      return;
    }
    if (document.visibilityState !== 'visible') return;
    if (!isDespiaOAuthInFlight()) return;
    if (!sawHidden) return;
    if (sheetCancelTimer != null) window.clearTimeout(sheetCancelTimer);
    // Grace so App Link / deeplink can land before we treat this as cancel.
    sheetCancelTimer = window.setTimeout(tryCancel, 4500);
  };

  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  document.addEventListener('app-resumed', onVisible);

  const watch = window.setInterval(() => {
    if (generation !== sheetCancelGeneration || !isDespiaOAuthInFlight()) {
      window.clearInterval(watch);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('app-resumed', onVisible);
      if (sheetCancelTimer != null) {
        window.clearTimeout(sheetCancelTimer);
        sheetCancelTimer = null;
      }
    }
  }, 500);
}

async function launchDespiaOAuthUrl(
  authUrl: string,
  provider: 'google' | 'apple',
  intent: 'signin' | 'link' = 'signin',
): Promise<{
  pending: boolean;
  error: VybeAuthError | null;
}> {
  if (!isDespiaRuntime()) {
    return { pending: false, error: { message: 'Despia OAuth is only available in the native app' } };
  }

  try {
    markDespiaOAuthPending(provider, intent);
    const oauthNonce =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(DESPIA_OAUTH_NONCE_KEY) : null;
    if (oauthNonce) startDespiaOAuthNoncePoll(oauthNonce);
    armDespiaOAuthSheetCancelWatch();

    const oauthBridge = `oauth://?url=${encodeURIComponent(authUrl)}`;
    // #region agent log
    {
      const rtMatch = authUrl.match(/response_type=([^&]+)/);
      void fetch('https://us-central1-vybe-daaab.cloudfunctions.net/authQr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            action: 'debug_oauth',
            event: 'oauth_launch',
            hypothesisId: 'A',
            location: 'despiaOAuth.ts:launchDespiaOAuthUrl',
            payload: {
              provider,
              intent,
              hasNonce: Boolean(oauthNonce),
              responseTypeEnc: rtMatch ? rtMatch[1] : null,
            },
          },
        }),
        keepalive: true,
      }).catch(() => {});
    }
    // #endregion
    // Completion via deeplink AND/OR nonce poll. Dismiss without tokens → cancel watch.
    void despiaCall(oauthBridge, [...DESPIA_OAUTH_URL_KEYS], 90_000).then((payload) => {
      // #region agent log
      void fetch('https://us-central1-vybe-daaab.cloudfunctions.net/authQr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            action: 'debug_oauth',
            event: 'despia_bridge_result',
            hypothesisId: 'C',
            location: 'despiaOAuth.ts:despiaCall.then',
            payload: {
              provider,
              intent,
              hasPayload: Boolean(payload),
              stillInFlight: isDespiaOAuthInFlight(),
            },
          },
        }),
        keepalive: true,
      }).catch(() => {});
      // #endregion
      // Bridge often returns null while the sheet is still open — do NOT cancel here.
      if (!payload) return;

      for (const key of DESPIA_OAUTH_URL_KEYS) {
        const value = payload[key];
        const asUrl =
          typeof value === 'string'
            ? value
            : value && typeof value === 'object' && 'url' in value
              ? String((value as { url?: string }).url || '')
              : '';
        if (asUrl && isDespiaOAuthReturnUrl(asUrl)) {
          void (async () => {
            const params = parseOAuthParamsFromUrl(asUrl);
            const waiting = params.get('wait') === '1' || params.has('wait');
            const hasTokens =
              params.has('hc') ||
              params.has('handoff_code') ||
              params.has('id_token') ||
              params.has('custom_token') ||
              params.has('customToken');
            if (waiting && !hasTokens && !params.has('error')) {
              // Soft-close only — keep poll; do not emit cancel.
              await completeDespiaOAuthFromUrl(asUrl);
              return;
            }
            const result = await completeDespiaOAuthFromUrl(asUrl);
            if (result.data.session?.user || result.error) {
              window.dispatchEvent(new CustomEvent('despia-oauth-complete', { detail: result }));
            }
          })();
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
  return launchDespiaOAuthUrl(await buildGoogleOAuthUrl('signin'), 'google', 'signin');
}

/**
 * Apple on Despia: iOS uses Apple JS SDK (Face ID); Android uses oauth://.
 * Browser / non-Despia still uses the JS SDK.
 */
export async function signInWithAppleDespia(): Promise<{
  pending: boolean;
  error: VybeAuthError | null;
  data?: { session: VybeSession | null };
}> {
  // #region agent log
  debugSessionLog('despiaOAuth.ts:502', 'apple_signin_entry', { despia: isDespiaRuntime(), runtimeOs: getRuntimeOs() }, 'H1');
  // #endregion
  if (isDespiaRuntime()) {
    // iOS Despia: Apple JS SDK only (native Face ID). Capacitor/web OAuth opens a stuck
    // vybehub.app ASWeb sheet under Face ID — never use those on iOS.
    if (getRuntimeOs() === 'ios') {
      // #region agent log
      debugSessionLog('despiaOAuth.ts:506', 'apple_signin_js_sdk_ios_only', { provider: 'apple' }, 'H-apple');
      // #endregion
      const { signInWithAppleJsSdk } = await import('@/lib/appleSignIn');
      const js = await signInWithAppleJsSdk();
      // #region agent log
      debugSessionLog(
        'despiaOAuth.ts:512',
        'apple_signin_js_sdk_result',
        { hasSession: !!js.data.session?.user, errorName: js.error?.name || null },
        'H-apple',
        'post-fix',
      );
      // #endregion
      if (js.error) return { pending: false, error: js.error, data: { session: null } };
      return { pending: false, error: null, data: { session: js.data.session } };
    }
    // #region agent log
    debugSessionLog('despiaOAuth.ts:528', 'apple_signin_oauth_websheet_branch', { provider: 'apple', runtimeOs: getRuntimeOs() }, 'H1');
    // #endregion
    return launchDespiaOAuthUrl(await buildAppleOAuthUrl('signin'), 'apple', 'signin');
  }

  const { signInWithAppleJsSdk } = await import('@/lib/appleSignIn');
  const js = await signInWithAppleJsSdk();
  if (js.error) return { pending: false, error: js.error, data: { session: null } };
  return { pending: false, error: null, data: { session: js.data.session } };
}

/** Settings → Connections: link Google/Apple on Despia via oauth:// (not linkWithPopup). */
export async function linkProviderWithDespiaOAuth(
  provider: 'google' | 'apple',
): Promise<{ pending: boolean; error: VybeAuthError | null }> {
  // #region agent log
  debugSessionLog('despiaOAuth.ts:548', 'link_provider_entry', { provider, despia: isDespiaRuntime(), runtimeOs: getRuntimeOs() }, 'H1');
  // #endregion
  if (!isDespiaRuntime()) {
    return { pending: false, error: { message: 'Despia link requires the native app' } };
  }
  if (provider === 'apple' && getRuntimeOs() === 'ios') {
    // #region agent log
    debugSessionLog('despiaOAuth.ts:554', 'link_provider_js_sdk_ios_only', { provider: 'apple' }, 'H1');
    // #endregion
    const { linkWithAppleJsSdk } = await import('@/lib/appleSignIn');
    const result = await linkWithAppleJsSdk();
    return { pending: false, error: result.error };
  }
  const url = provider === 'apple' ? await buildAppleOAuthUrl('link') : await buildGoogleOAuthUrl('link');
  return launchDespiaOAuthUrl(url, provider, 'link');
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

type RedeemedHandoff = {
  customToken?: string;
  idToken?: string;
  nonce?: string;
  provider?: string;
};

/** One network redeem per hc= — App Link + nonce poll + deeplink handler race otherwise. */
const handoffRedeemByCode = new Map<string, Promise<RedeemedHandoff>>();
const oauthCompleteByHc = new Map<string, Promise<DespiaOAuthCompletion>>();

async function redeemOAuthHandoffCode(code: string): Promise<RedeemedHandoff> {
  const key = code.trim().toLowerCase();
  const existing = handoffRedeemByCode.get(key);
  if (existing) return existing;

  // Placeholder MUST be registered before any await (dynamic import yields the turn).
  let settle!: (value: RedeemedHandoff | PromiseLike<RedeemedHandoff>) => void;
  let fail!: (reason?: unknown) => void;
  const pending = new Promise<RedeemedHandoff>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  handoffRedeemByCode.set(key, pending);

  void (async () => {
    try {
      const { invokeFunction } = await import('@/lib/firebase/functionsService');
      const { data, error } = await invokeFunction<{
        customToken?: string;
        custom_token?: string;
        idToken?: string;
        id_token?: string;
        nonce?: string;
        provider?: string;
      }>('authQr', { action: 'redeem_oauth_code', code: key });
      if (error || !data) {
        throw Object.assign(new Error(error?.message || 'OAuth code redeem failed'), {
          code: error?.name || 'despia/oauth-redeem-failed',
        });
      }
      settle({
        customToken: data.customToken || data.custom_token || undefined,
        idToken: data.idToken || data.id_token || undefined,
        nonce: data.nonce || undefined,
        provider: data.provider || undefined,
      });
    } catch (err) {
      handoffRedeemByCode.delete(key);
      fail(err);
    }
  })();

  return pending;
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
        stopDespiaOAuthNoncePoll();
        const storedIntent =
          typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(DESPIA_OAUTH_INTENT_KEY) : null;
        const state = encodeOAuthState({
          scheme: getDespiaDeeplinkScheme(),
          nonce: clean,
          provider: (data.provider as string) || 'google',
          intent: storedIntent === 'link' ? 'link' : 'signin',
        });
        const synthetic = `${window.location.origin}/auth?hc=${encodeURIComponent(data.code)}&state=${encodeURIComponent(state)}${storedIntent === 'link' ? '&intent=link' : ''}`;
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

async function completeDespiaOAuthFromUrlInner(url: string): Promise<DespiaOAuthCompletion> {
  const params = parseOAuthParamsFromUrl(url);
  const error = params.get('error');
  const errorDescription = params.get('error_description');

  // Soft-close (wait=1): keep nonce poll alive — never treat as cancel.
  const waitNonce = (params.get('nonce') || '').trim();
  const waiting = params.get('wait') === '1' || params.has('wait');
  if (
    waiting &&
    !params.has('hc') &&
    !params.has('handoff_code') &&
    !params.has('id_token') &&
    !params.has('custom_token') &&
    !params.has('customToken') &&
    !error
  ) {
    // #region agent log
    debugSessionLog(
      'despiaOAuth.ts:wait1',
      'oauth_wait1_keep_polling',
      { hasNonce: Boolean(waitNonce), provider: params.get('provider') || null },
      'H-oauth',
      'post-fix',
    );
    // #endregion
    if (waitNonce) {
      const providerHint = (params.get('provider') || 'google') as 'google' | 'apple';
      const intentHint = params.get('intent') === 'link' ? 'link' : 'signin';
      markDespiaOAuthPending(providerHint === 'apple' ? 'apple' : 'google', intentHint);
      try {
        sessionStorage.setItem(DESPIA_OAUTH_NONCE_KEY, waitNonce);
      } catch {
        /* ignore */
      }
      startDespiaOAuthNoncePoll(waitNonce);
    }
    // Bare wait=1 (no nonce) — do NOT clear pending; sheet dismiss only.
    return { data: { session: null }, error: null };
  }

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
  // Stop nonce poll immediately so it cannot race a parallel redeem of the same hc=.
  if (handoffCode) stopDespiaOAuthNoncePoll();

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
      // Parallel App Link + nonce-poll: first redeem wins; late callers may see already-used.
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
      const message = err instanceof Error ? err.message : 'OAuth code redeem failed';
      const alreadyUsed = /already used|not-found|expired/i.test(message);
      if (alreadyUsed) {
        // Brief wait for the winning redeem to finish signing in.
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 100));
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
        }
      }
      clearDespiaOAuthPending();
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code)
          : 'despia/oauth-redeem-failed';
      return { data: { session: null }, error: { message, name: code } };
    }
  }

  if (!customToken && !idToken) {
    // Incomplete URL without wait=1 — only cancel if we are not still polling a nonce.
    const hasNonce =
      typeof sessionStorage !== 'undefined' && Boolean(sessionStorage.getItem(DESPIA_OAUTH_NONCE_KEY));
    if (hasNonce || isDespiaOAuthInFlight()) {
      // #region agent log
      debugSessionLog(
        'despiaOAuth.ts:incomplete',
        'oauth_incomplete_keep_pending',
        { hasNonce, inFlight: isDespiaOAuthInFlight() },
        'H-oauth',
        'post-fix',
      );
      // #endregion
      return { data: { session: null }, error: null };
    }
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
    const storedIntent =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(DESPIA_OAUTH_INTENT_KEY) : null;
    const linkIntent =
      params.get('intent') === 'link' ||
      state?.intent === 'link' ||
      storedIntent === 'link';

    if (linkIntent) {
      if (!auth.currentUser) {
        clearDespiaOAuthPending();
        return {
          data: { session: null },
          error: { message: 'Sign in before linking an account.', name: 'auth/not-authenticated' },
        };
      }
      if (!idToken) {
        clearDespiaOAuthPending();
        return {
          data: { session: null },
          error: {
            message: 'Could not link — missing provider token. Try again.',
            name: 'despia/oauth-link-missing-token',
          },
        };
      }
      if (providerHint === 'apple') {
        const apple = new OAuthProvider('apple.com');
        const credential = apple.credential({
          idToken,
          rawNonce: redeemedNonce || storedNonce || state?.nonce || undefined,
        });
        await linkWithCredential(auth.currentUser, credential);
      } else {
        await linkWithCredential(auth.currentUser, GoogleAuthProvider.credential(idToken));
      }
    } else if (customToken) {
      // Prefer custom-token handoff for both Google and Apple (App Link remount safe).
      await signInWithCustomToken(auth, customToken);
    } else if (providerHint === 'apple') {
      const apple = new OAuthProvider('apple.com');
      const credential = apple.credential({
        idToken: idToken!,
        rawNonce: redeemedNonce || storedNonce || state?.nonce || undefined,
      });
      await signInWithCredential(auth, credential);
    } else {
      // Google fallback: avoid direct signInWithCredential nonce-mismatch path.
      // Re-exchange id_token server-side and sign in with Firebase custom token.
      const nonceForExchange = redeemedNonce || storedNonce || state?.nonce || undefined;
      const { invokeFunction } = await import('@/lib/firebase/functionsService');
      const { data: exchanged, error: exErr } = await invokeFunction<{
        customToken?: string;
        custom_token?: string;
      }>('authQr', {
        action: 'exchange_google',
        idToken: idToken!,
        nonce: nonceForExchange,
      });
      const fallbackCustomToken = exchanged?.customToken || exchanged?.custom_token || null;
      if (exErr || !fallbackCustomToken) {
        throw new Error(exErr?.message || 'google_exchange_failed');
      }
      await signInWithCustomToken(auth, fallbackCustomToken);
    }
    await auth.authStateReady();
    // #region agent log
    try {
      const persisted = Object.keys(localStorage).some((k) => k.startsWith('firebase:authUser:'));
      debugSessionLog(
        'despiaOAuth.ts:persist',
        'oauth_session_persisted',
        {
          hasCurrentUser: Boolean(auth.currentUser),
          localStorageAuthUser: persisted,
          host: typeof location !== 'undefined' ? location.hostname : '',
        },
        'H-session',
        'post-fix',
      );
    } catch {
      /* ignore */
    }
    // #endregion
    clearDespiaOAuthPending();

    const { data, error: sessionError } = await firebaseAuth.getSession();
    if (sessionError) {
      return { data: { session: null }, error: sessionError };
    }
    const completion = {
      data: { session: data.session, linked: linkIntent },
      error: null,
    };
    if (data.session?.user) {
      try {
        const cleanPath = window.location.pathname || '/auth';
        const keepSettings =
          cleanPath.startsWith('/settings') || window.location.search.includes('tab=connections');
        if (!keepSettings) {
          window.history.replaceState({}, '', cleanPath);
        } else if (linkIntent) {
          window.history.replaceState({}, '', '/settings?tab=connections&linked=' + providerHint);
        }
      } catch {
        /* ignore */
      }
      try {
        if (!linkIntent) {
          const { claimProfileAfterOAuth } = await import('@/lib/oauthAccountLink');
          await claimProfileAfterOAuth();
        }
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

/** Complete Firebase sign-in from Despia deeplink or /auth?custom_token=... / id_token return. */
export async function completeDespiaOAuthFromUrl(url: string): Promise<DespiaOAuthCompletion> {
  const params = parseOAuthParamsFromUrl(url);
  const handoffCode = (params.get('hc') || params.get('handoff_code') || '').trim().toLowerCase();
  if (handoffCode) {
    const existing = oauthCompleteByHc.get(handoffCode);
    if (existing) return existing;
    // Register placeholder before any await inside Inner.
    let settle!: (value: DespiaOAuthCompletion | PromiseLike<DespiaOAuthCompletion>) => void;
    let fail!: (reason?: unknown) => void;
    const pending = new Promise<DespiaOAuthCompletion>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
    oauthCompleteByHc.set(handoffCode, pending);
    void completeDespiaOAuthFromUrlInner(url).then(settle, (err) => {
      oauthCompleteByHc.delete(handoffCode);
      fail(err);
    });
    return pending;
  }
  return completeDespiaOAuthFromUrlInner(url);
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
    const intentHint = params.get('intent') === 'link' ? 'link' : 'signin';
    markDespiaOAuthPending(providerHint === 'apple' ? 'apple' : 'google', intentHint);
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
    // Single completion path — do not also call completeDespiaOAuthFromUrl(url)
    // (that double-redeemed hc= and toasted "already used").
    void (async () => {
      const params = parseOAuthParamsFromUrl(url);
      const hasDirectTokens = /[?&#](hc|id_token|custom_token|handoff_code)=/i.test(url);
      const result = hasDirectTokens
        ? await completeDespiaOAuthFromUrl(url)
        : await tryCompleteDespiaOAuthFromCurrentUrl();
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
    })();
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
