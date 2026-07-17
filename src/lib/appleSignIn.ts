/**
 * Sign in with Apple via Apple JS SDK (Safari / non-Despia browsers).
 * Despia iOS + Android must use oauth:// — see despiaOAuth.ts. Apple JS usePopup
 * returns opaque {error:"unknown"} inside Despia WKWebView even with full
 * window.open guard bypass.
 */
import { OAuthProvider, linkWithCredential, signInWithCredential } from 'firebase/auth';
import { getProductionOrigin } from '@/lib/authRedirect';
import { authLog } from '@/lib/authLog';
import { runWithExternalLinkGuardBypassed } from '@/lib/externalLinkGuard';
import { mapOAuthLinkError } from '@/lib/oauthAccountLink';
import { issHostname, oauthTimelineLog } from '@/lib/oauthDebugTimeline';
import type { VybeAuthError, VybeSession } from '@/lib/firebase/types';

const APPLE_SCRIPT = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
const DEFAULT_APPLE_SERVICES_ID = 'com.despia.vybe.web';

type AppleAuthResponse = {
  authorization?: { id_token?: string; code?: string };
  user?: unknown;
  error?: string;
  /** Set when unknown-retry used a fresh nonce (must match Firebase credential). */
  __rawNonce?: string;
};

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (cfg: Record<string, unknown>) => void;
        signIn: () => Promise<AppleAuthResponse>;
      };
    };
  }
}

function getAppleServicesId(): string {
  const fromEnv = import.meta.env.VITE_APPLE_SERVICES_ID || import.meta.env.VITE_APPLE_CLIENT_ID;
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
  return DEFAULT_APPLE_SERVICES_ID;
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

/** Apple JS often throws plain objects — String(err) becomes "[object Object]". */
function formatAppleAuthError(err: unknown): { code: string; message: string } {
  if (err == null) return { code: '', message: 'unknown' };
  if (typeof err === 'string') return { code: '', message: err.slice(0, 200) };
  if (err instanceof Error) {
    return {
      code: String((err as { code?: string }).code || err.name || '').slice(0, 80),
      message: String(err.message || '').slice(0, 200),
    };
  }
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const nested =
      o.error && typeof o.error === 'object' ? (o.error as Record<string, unknown>) : null;
    const code = String(
      o.code || o.error || nested?.code || nested?.error || o.name || '',
    ).slice(0, 80);
    let message = String(o.message || nested?.message || o.error || '').slice(0, 200);
    if (!message || message === '[object Object]') {
      try {
        message = JSON.stringify(err).slice(0, 200);
      } catch {
        message = 'apple_auth_error';
      }
    }
    if (code === '[object Object]') {
      return { code: '', message };
    }
    return { code, message };
  }
  return { code: '', message: String(err).slice(0, 200) };
}

function isAppleUnknownError(err: unknown, code: string, message: string): boolean {
  const asAny = err as { error?: string };
  return (
    /^unknown$/i.test(code) ||
    /^unknown$/i.test(message) ||
    /^unknown$/i.test(String(asAny?.error || ''))
  );
}

const APPLE_POPUP_BLOCKED_ERROR: VybeAuthError = {
  message: 'Apple Sign-In could not open. Try again.',
  name: 'apple/popup-blocked',
};

/** Dismiss any leftover popup window — never fire oauth wait=1 (that clears pending login). */
function dismissAppleWebSheetResidue(): void {
  try {
    if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
      window.close();
    }
  } catch {
    /* ignore */
  }
}

let scriptPromise: Promise<void> | null = null;

/** Prefetch Apple JS so the first tap opens the native sheet immediately. */
export function loadAppleIdScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.AppleID?.auth) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-apple-auth]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Apple auth script failed')));
      if (window.AppleID?.auth) resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = APPLE_SCRIPT;
    s.async = true;
    s.dataset.appleAuth = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Apple auth script failed to load'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** Fire-and-forget preload for Landing mount. */
export function preloadAppleSignIn(): void {
  void loadAppleIdScript().catch(() => {
    /* ignore — tap will retry */
  });
}

/**
 * Run AppleID.auth.signIn with native window.open restored (full link-guard bypass).
 * Apple's usePopup needs a real Window + opener for web_message; any wrapper can
 * yield opaque {error:"unknown"} in ~300ms inside Despia WKWebView.
 */
async function appleAuthSignInWithGuardBypass(
  hashedNonce: string,
  logLocation: string,
): Promise<AppleAuthResponse> {
  if (!window.AppleID?.auth) {
    throw { error: 'apple/sdk-missing', message: 'Apple Sign-In unavailable' };
  }

  // Must match Apple Services ID return URL. usePopup returns tokens to JS;
  // avoid navigating the main WebView to native-callback.
  const redirectURI = `${getProductionOrigin()}/native-callback.html`;
  window.AppleID.auth.init({
    clientId: getAppleServicesId(),
    scope: 'name email',
    redirectURI,
    usePopup: true,
    nonce: hashedNonce,
  });

  dismissAppleWebSheetResidue();
  try {
    oauthTimelineLog(
      'apple_sdk_start',
      {
        clientId: getAppleServicesId(),
        hasAppleID: !!window.AppleID?.auth,
        redirectPath: '/native-callback.html',
        usePopup: true,
        guardBypass: true,
      },
      logLocation,
    );
    return await runWithExternalLinkGuardBypassed(() => window.AppleID!.auth.signIn());
  } finally {
    dismissAppleWebSheetResidue();
  }
}

function responseLooksUnknown(response: AppleAuthResponse): boolean {
  const err = String(response.error || '');
  return !!err && isAppleUnknownError(response, err, err) && !response.authorization?.id_token;
}

/**
 * First attempt + one retry on opaque "unknown", both with full link-guard bypass.
 * On retry, stamps `__rawNonce` so Firebase credential uses the matching nonce.
 */
async function appleAuthSignInWithUnknownRetry(
  hashedNonce: string,
  logLocation: string,
): Promise<AppleAuthResponse> {
  const runRetry = async (): Promise<AppleAuthResponse> => {
    oauthTimelineLog(
      'apple_sdk_retry',
      { reason: 'unknown', attempt: 2, guardBypass: true },
      `${logLocation}:retry`,
    );
    const retryRaw = randomNonce();
    const retryHash = await sha256Hex(retryRaw);
    const response = await appleAuthSignInWithGuardBypass(retryHash, `${logLocation}:retry`);
    response.__rawNonce = retryRaw;
    return response;
  };

  try {
    const response = await appleAuthSignInWithGuardBypass(hashedNonce, logLocation);
    if (responseLooksUnknown(response)) return runRetry();
    return response;
  } catch (err: unknown) {
    const { code, message } = formatAppleAuthError(err);
    if (!isAppleUnknownError(err, code, message)) throw err;
    return runRetry();
  }
}

/**
 * Native-style Apple Sign-In (JS SDK). Returns a Firebase session when successful.
 */
export async function signInWithAppleJsSdk(): Promise<{
  data: { session: VybeSession | null };
  error: VybeAuthError | null;
}> {
  let rawNonce = randomNonce();
  try {
    await loadAppleIdScript();
    if (!window.AppleID?.auth) {
      return { data: { session: null }, error: { message: 'Apple Sign-In unavailable', name: 'apple/sdk-missing' } };
    }

    const hashedNonce = await sha256Hex(rawNonce);
    const response = await appleAuthSignInWithUnknownRetry(hashedNonce, 'appleSignIn.ts:signIn');
    if (response.__rawNonce) {
      rawNonce = response.__rawNonce;
      delete response.__rawNonce;
    }

    const idToken = response.authorization?.id_token;
    if (!idToken) {
      oauthTimelineLog(
        'apple_sdk_done',
        {
          ok: false,
          reason: 'missing_token',
          hasError: !!response.error,
          error: String(response.error || '').slice(0, 80),
        },
        'appleSignIn.ts:missingToken',
      );
      if (isAppleUnknownError(response, String(response.error || ''), String(response.error || ''))) {
        return { data: { session: null }, error: APPLE_POPUP_BLOCKED_ERROR };
      }
      return {
        data: { session: null },
        error: { message: 'Apple Sign-In did not return a token', name: 'apple/missing-token' },
      };
    }

    const { firebaseAuth } = await import('@/lib/firebase');
    const auth = firebaseAuth.auth;
    if (!auth) {
      return { data: { session: null }, error: { message: 'Firebase is not configured', name: 'firebase/not-configured' } };
    }

    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({ idToken, rawNonce });
    await signInWithCredential(auth, credential);
    const { data, error } = await firebaseAuth.getSession();
    if (error) {
      const rawCode = String((error as { code?: string; name?: string }).code || (error as { name?: string }).name || '');
      const rawMessage = String((error as { message?: string }).message || '');
      authLog('apple_firebase_session_error', { code: rawCode, message: rawMessage.slice(0, 200) });
      oauthTimelineLog(
        'apple_sdk_done',
        { ok: false, reason: 'session_error', code: rawCode.slice(0, 60), msg: rawMessage.slice(0, 120) },
        'appleSignIn.ts:getSession',
      );
      return { data: { session: null }, error: mapOAuthLinkError(error) };
    }
    let tokenIss = '';
    try {
      const mid = idToken.split('.')[1];
      if (mid) {
        const padded = mid.replace(/-/g, '+').replace(/_/g, '/');
        const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
        tokenIss = issHostname(JSON.parse(json)?.iss);
      }
    } catch {
      /* ignore */
    }
    oauthTimelineLog(
      'apple_sdk_done',
      {
        ok: true,
        hasUser: !!data.session?.user,
        idTokenLen: idToken.length,
        iss: tokenIss,
      },
      'appleSignIn.ts:success',
    );
    return { data: { session: data.session }, error: null };
  } catch (err: unknown) {
    dismissAppleWebSheetResidue();
    const { code: rawCode, message: rawMessage } = formatAppleAuthError(err);
    const asAny = err as { error?: string; message?: string; code?: string };
    authLog('apple_signin_error', { code: rawCode, message: rawMessage });
    oauthTimelineLog(
      'apple_sdk_done',
      {
        ok: false,
        reason: 'error',
        code: rawCode.slice(0, 60),
        error: String(asAny?.error || rawCode || '').slice(0, 60),
        msg: rawMessage.slice(0, 120),
      },
      'appleSignIn.ts:catch',
    );
    if (
      asAny?.error === 'popup_closed_by_user' ||
      asAny?.error === 'user_cancelled' ||
      rawCode === 'popup_closed_by_user' ||
      rawCode === 'user_cancelled' ||
      /cancel|popup.?closed/i.test(rawMessage)
    ) {
      return {
        data: { session: null },
        error: { message: 'Sign-in cancelled', name: 'auth/popup-closed-by-user' },
      };
    }
    if (isAppleUnknownError(err, rawCode, rawMessage)) {
      return { data: { session: null }, error: APPLE_POPUP_BLOCKED_ERROR };
    }
    if (
      asAny?.code === 'auth/operation-not-allowed' ||
      /operation-not-allowed/i.test(rawMessage) ||
      /not enabled/i.test(rawMessage)
    ) {
      return {
        data: { session: null },
        error: {
          message: 'Apple Sign-In is not enabled for this app. Check Firebase Apple provider setup.',
          name: 'auth/operation-not-allowed',
        },
      };
    }
    if (/403|invalid_client|unauthorized/i.test(rawMessage)) {
      return {
        data: { session: null },
        error: {
          message:
            'Apple rejected sign-in. Confirm Services ID com.despia.vybe.web and return URL https://vybehub.app/native-callback.html.',
          name: 'auth/invalid-credential',
        },
      };
    }
    if (rawMessage && rawMessage !== '[object Object]' && !/^unknown$/i.test(rawMessage)) {
      return {
        data: { session: null },
        error: mapOAuthLinkError({ message: rawMessage, name: rawCode || 'apple/signin-failed', code: rawCode }),
      };
    }
    return { data: { session: null }, error: mapOAuthLinkError(err) };
  }
}

/**
 * Link current signed-in user with Apple using Apple JS SDK native popup.
 * iOS Despia uses this to avoid web-sheet OAuth for Settings → Connections.
 */
export async function linkWithAppleJsSdk(): Promise<{
  data: { linked: boolean };
  error: VybeAuthError | null;
}> {
  let rawNonce = randomNonce();
  try {
    await loadAppleIdScript();
    if (!window.AppleID?.auth) {
      return { data: { linked: false }, error: { message: 'Apple Sign-In unavailable', name: 'apple/sdk-missing' } };
    }

    const { firebaseAuth } = await import('@/lib/firebase');
    const auth = firebaseAuth.auth;
    if (!auth?.currentUser) {
      return { data: { linked: false }, error: { message: 'Sign in before linking Apple.', name: 'auth/not-authenticated' } };
    }

    const hashedNonce = await sha256Hex(rawNonce);
    const response = await appleAuthSignInWithUnknownRetry(hashedNonce, 'appleSignIn.ts:link');
    if (response.__rawNonce) {
      rawNonce = response.__rawNonce;
      delete response.__rawNonce;
    }

    const idToken = response.authorization?.id_token;
    if (!idToken) {
      if (isAppleUnknownError(response, String(response.error || ''), String(response.error || ''))) {
        return { data: { linked: false }, error: APPLE_POPUP_BLOCKED_ERROR };
      }
      return {
        data: { linked: false },
        error: { message: 'Apple Sign-In did not return a token', name: 'apple/missing-token' },
      };
    }

    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({ idToken, rawNonce });
    await linkWithCredential(auth.currentUser, credential);
    return { data: { linked: true }, error: null };
  } catch (err: unknown) {
    dismissAppleWebSheetResidue();
    const { code: rawCode, message: rawMessage } = formatAppleAuthError(err);
    const asAny = err as { error?: string; message?: string; code?: string };
    authLog('apple_link_error', { code: rawCode, message: rawMessage });
    oauthTimelineLog(
      'apple_sdk_link_done',
      {
        ok: false,
        reason: 'error',
        code: rawCode.slice(0, 60),
        msg: rawMessage.slice(0, 120),
      },
      'appleSignIn.ts:link.catch',
    );
    if (
      asAny?.error === 'popup_closed_by_user' ||
      asAny?.error === 'user_cancelled' ||
      rawCode === 'popup_closed_by_user' ||
      rawCode === 'user_cancelled' ||
      /cancel|popup.?closed/i.test(rawMessage)
    ) {
      return {
        data: { linked: false },
        error: { message: 'Sign-in cancelled', name: 'auth/popup-closed-by-user' },
      };
    }
    if (isAppleUnknownError(err, rawCode, rawMessage)) {
      return { data: { linked: false }, error: APPLE_POPUP_BLOCKED_ERROR };
    }
    if (rawMessage && rawMessage !== '[object Object]' && !/^unknown$/i.test(rawMessage)) {
      return {
        data: { linked: false },
        error: mapOAuthLinkError({ message: rawMessage, name: rawCode || 'apple/link-failed', code: rawCode }),
      };
    }
    return { data: { linked: false }, error: mapOAuthLinkError(err) };
  }
}
