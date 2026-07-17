/**
 * Sign in with Apple via Apple JS SDK (native Face ID / Continue sheet on iOS Despia
 * and Safari). Android Despia should keep using oauth:// — see despiaOAuth.ts.
 */
import { OAuthProvider, linkWithCredential, signInWithCredential } from 'firebase/auth';
import { getProductionOrigin } from '@/lib/authRedirect';
import { authLog } from '@/lib/authLog';
import { mapOAuthLinkError } from '@/lib/oauthAccountLink';
import { issHostname, oauthTimelineLog } from '@/lib/oauthDebugTimeline';
import type { VybeAuthError, VybeSession } from '@/lib/firebase/types';

const APPLE_SCRIPT = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
const DEFAULT_APPLE_SERVICES_ID = 'com.despia.vybe.web';

type AppleAuthResponse = {
  authorization?: { id_token?: string; code?: string };
  user?: unknown;
  error?: string;
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
 * Native-style Apple Sign-In (JS SDK). Returns a Firebase session when successful.
 */
export async function signInWithAppleJsSdk(): Promise<{
  data: { session: VybeSession | null };
  error: VybeAuthError | null;
}> {
  try {
    await loadAppleIdScript();
    if (!window.AppleID?.auth) {
      return { data: { session: null }, error: { message: 'Apple Sign-In unavailable', name: 'apple/sdk-missing' } };
    }

    const rawNonce = randomNonce();
    const hashedNonce = await sha256Hex(rawNonce);
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

    // Keep dismissing Despia ASWeb while Face ID runs so only the native sheet is visible.
    // Do NOT window.close() from an interval — that can kill the Apple popup mid-auth.
    dismissAppleWebSheetResidue();
    let response: AppleAuthResponse;
    try {
      // #region agent log
      oauthTimelineLog(
        'apple_sdk_start',
        {
          clientId: getAppleServicesId(),
          hasAppleID: !!window.AppleID?.auth,
          redirectPath: '/native-callback.html',
          usePopup: true,
        },
        'appleSignIn.ts:signIn',
      );
      // #endregion
      response = await window.AppleID.auth.signIn();
    } finally {
      dismissAppleWebSheetResidue();
    }

    const idToken = response.authorization?.id_token;
    if (!idToken) {
      // #region agent log
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
      // #endregion
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
    // #region agent log
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
    // #endregion
    return { data: { session: data.session }, error: null };
  } catch (err: unknown) {
    dismissAppleWebSheetResidue();
    const { code: rawCode, message: rawMessage } = formatAppleAuthError(err);
    const asAny = err as { error?: string; message?: string; code?: string };
    // Log exact Firebase/Apple code+message BEFORE friendly mapping.
    authLog('apple_signin_error', { code: rawCode, message: rawMessage });
    // #region agent log
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
    // #endregion
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
    // Prefer structured message over mapOAuthLinkError collapsing to "Sign-in failed".
    if (rawMessage && rawMessage !== '[object Object]') {
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

    const rawNonce = randomNonce();
    const hashedNonce = await sha256Hex(rawNonce);
    const redirectURI = `${getProductionOrigin()}/native-callback.html`;

    window.AppleID.auth.init({
      clientId: getAppleServicesId(),
      scope: 'name email',
      redirectURI,
      usePopup: true,
      nonce: hashedNonce,
    });

    const hideWeb = window.setInterval(() => dismissAppleWebSheetResidue(), 180);
    let response: AppleAuthResponse;
    try {
      response = await window.AppleID.auth.signIn();
    } finally {
      window.clearInterval(hideWeb);
      dismissAppleWebSheetResidue();
    }
    const idToken = response.authorization?.id_token;
    if (!idToken) {
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
    // Log exact Firebase/Apple code+message BEFORE friendly mapping.
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
    if (rawMessage && rawMessage !== '[object Object]') {
      return {
        data: { linked: false },
        error: mapOAuthLinkError({ message: rawMessage, name: rawCode || 'apple/link-failed', code: rawCode }),
      };
    }
    return { data: { linked: false }, error: mapOAuthLinkError(err) };
  }
}
