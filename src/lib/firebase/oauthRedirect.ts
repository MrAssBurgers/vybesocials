import { getRedirectResult } from 'firebase/auth';
import { browserPopupRedirectResolver, firebaseAuth } from './authService';
import type { VybeSession, VybeAuthError } from './types';
import { isMobileOrTabletDevice } from '@/lib/deviceDetection';
import { isSafeInternalReturnPath } from '@/lib/safeNavigate';
import { authLog, authWarn } from '@/lib/authLog';

export type OAuthRedirectCapture = {
  session: VybeSession | null;
  error: VybeAuthError | null;
};

const OAUTH_PENDING_KEY = 'vybe-oauth-pending';
const OAUTH_PENDING_AT_KEY = 'vybe-oauth-pending-at';
/** Brief-compatible keys (localStorage + sessionStorage). */
const OAUTH_RETURN_PATH_KEY = 'vybe.oauth.returnPath';
const OAUTH_PROVIDER_KEY = 'vybe.oauth.provider';
const OAUTH_STARTED_AT_KEY = 'vybe.oauth.startedAt';
const OAUTH_REQUEST_ID_KEY = 'vybe.oauth.requestId';
const OAUTH_PENDING_MAX_MS = 3 * 60 * 1000;

function getOAuthRedirectTimeoutMs(): number {
  if (typeof window === 'undefined') return 8000;
  return isMobileOrTabletDevice() ? 18000 : 8000;
}

let capturePromise: Promise<OAuthRedirectCapture> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('OAuth redirect timed out')), ms);
    }),
  ]);
}

function writeBoth(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function removeBoth(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function readBoth(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    const s = sessionStorage.getItem(key);
    if (s) return s;
  } catch {
    /* ignore */
  }
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function readPendingAt(): number {
  if (typeof window === 'undefined') return 0;
  const started = Number(readBoth(OAUTH_STARTED_AT_KEY) || '0');
  if (started) return started;
  return Number(readBoth(OAUTH_PENDING_AT_KEY) || '0');
}

function isPendingFlagSet(): boolean {
  if (typeof window === 'undefined') return false;
  if (readBoth(OAUTH_PENDING_KEY) === 'true') return true;
  return Boolean(readBoth(OAUTH_REQUEST_ID_KEY));
}

export function validateOAuthReturnPath(path: string | null | undefined): string | null {
  if (!isSafeInternalReturnPath(path)) return null;
  return (path || '').trim();
}

export function markOAuthRedirectPending(opts?: {
  provider?: 'google' | 'apple';
  returnPath?: string;
}): void {
  if (typeof window === 'undefined') return;
  const at = String(Date.now());
  const requestId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `oauth_${at}_${Math.random().toString(36).slice(2, 10)}`;
  const returnPath =
    validateOAuthReturnPath(opts?.returnPath) ||
    validateOAuthReturnPath(`${window.location.pathname}${window.location.search}`) ||
    '/auth/callback';

  writeBoth(OAUTH_PENDING_KEY, 'true');
  writeBoth(OAUTH_PENDING_AT_KEY, at);
  writeBoth(OAUTH_STARTED_AT_KEY, at);
  writeBoth(OAUTH_REQUEST_ID_KEY, requestId);
  writeBoth(OAUTH_PROVIDER_KEY, opts?.provider || '');
  writeBoth(OAUTH_RETURN_PATH_KEY, returnPath);

  authLog('redirect_state_saved', {
    provider: opts?.provider || null,
    returnPath,
    requestId,
  });
}

export function clearOAuthRedirectPending(): void {
  if (typeof window === 'undefined') return;
  removeBoth(OAUTH_PENDING_KEY);
  removeBoth(OAUTH_PENDING_AT_KEY);
  removeBoth(OAUTH_STARTED_AT_KEY);
  removeBoth(OAUTH_REQUEST_ID_KEY);
  removeBoth(OAUTH_PROVIDER_KEY);
  removeBoth(OAUTH_RETURN_PATH_KEY);
}

export function getSavedOAuthReturnPath(): string | null {
  return validateOAuthReturnPath(readBoth(OAUTH_RETURN_PATH_KEY));
}

export function getSavedOAuthProvider(): string {
  return readBoth(OAUTH_PROVIDER_KEY);
}

export function hasSavedOAuthRedirectState(): boolean {
  return isPendingFlagSet();
}

/** Drop stale flags left from abandoned OAuth attempts (prevents auth init hang). */
export function clearStaleOAuthRedirectPending(): void {
  if (!isPendingFlagSet()) return;
  const at = readPendingAt();
  if (!at || Date.now() - at > OAUTH_PENDING_MAX_MS) {
    clearOAuthRedirectPending();
  }
}

function isOAuthReturnPending(): boolean {
  if (!isPendingFlagSet()) return false;
  const at = readPendingAt();
  if (at && Date.now() - at > OAUTH_PENDING_MAX_MS) {
    clearOAuthRedirectPending();
    return false;
  }
  return true;
}

/** URL hints that we just returned from Google/Apple OAuth redirect. */
export function isLikelyFirebaseOAuthReturnUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  const combined = `${search}${hash}`;
  return (
    /[?&]state=/.test(search) ||
    /[?&]code=/.test(search) ||
    /[?&]error=/.test(combined) ||
    hash.includes('access_token') ||
    hash.includes('id_token')
  );
}

function shouldTryOAuthRecovery(): boolean {
  return isOAuthReturnPending() || isLikelyFirebaseOAuthReturnUrl();
}

async function waitForAuthInstance(): Promise<NonNullable<typeof firebaseAuth.auth>> {
  let auth = firebaseAuth.auth;
  for (let i = 0; i < 10 && !auth; i++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    auth = firebaseAuth.auth;
  }
  return auth;
}

async function sessionFromCurrentUser(): Promise<VybeSession | null> {
  const { data } = await firebaseAuth.getSession();
  return data.session?.user ? data.session : null;
}

async function captureRedirectResult(): Promise<OAuthRedirectCapture> {
  const auth = await waitForAuthInstance();
  if (!auth) return { session: null, error: null };

  authLog('getRedirectResult_start', {
    host: typeof location !== 'undefined' ? location.hostname : '',
    path: typeof location !== 'undefined' ? location.pathname : '',
    pending: isOAuthReturnPending(),
    provider: getSavedOAuthProvider() || null,
  });

  try {
    if (auth.authStateReady) {
      await auth.authStateReady();
    }

    const recovering = shouldTryOAuthRecovery();
    if (recovering) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const result = await withTimeout(
      getRedirectResult(auth, browserPopupRedirectResolver),
      getOAuthRedirectTimeoutMs(),
    );
    if (result?.user) {
      const session = await sessionFromCurrentUser();
      if (session?.user) {
        clearOAuthRedirectPending();
        authLog('getRedirectResult_finish', { ok: true, uid: session.user.id });
        return { session, error: null };
      }
      return { session: null, error: { message: 'OAuth redirect completed without session' } };
    }

    if (recovering && auth.currentUser) {
      const session = await sessionFromCurrentUser();
      if (session?.user) {
        clearOAuthRedirectPending();
        authLog('getRedirectResult_finish', { ok: true, recovered: true, uid: session.user.id });
        return { session, error: null };
      }
    }

    authLog('getRedirectResult_finish', { ok: false, nullResult: true });
    return { session: null, error: null };
  } catch (err) {
    if (isPendingFlagSet()) clearOAuthRedirectPending();
    const message = err instanceof Error ? err.message : 'OAuth redirect failed';
    const code = (err as { code?: string }).code;
    authWarn('getRedirectResult_error', { code: code || null, message });
    return {
      session: null,
      error: { message, name: code },
    };
  }
}

/** Start getRedirectResult once during auth bootstrap (auth.tsx). */
export function captureOAuthRedirectOnLoad(): Promise<OAuthRedirectCapture> {
  if (capturePromise) return capturePromise;
  capturePromise = captureRedirectResult();
  return capturePromise;
}

export function awaitOAuthRedirectCapture(): Promise<OAuthRedirectCapture> {
  return captureOAuthRedirectOnLoad();
}

/** Alias expected by the shared auth service facade. */
export function completeOAuthRedirectOnce(): Promise<OAuthRedirectCapture> {
  return captureOAuthRedirectOnLoad();
}

export function isOAuthRedirectInFlight(): boolean {
  return isOAuthReturnPending();
}

/** Poll when getRedirectResult returned null but Firebase may already have signed in. */
export async function recoverOAuthSessionIfSignedIn(): Promise<OAuthRedirectCapture> {
  if (!shouldTryOAuthRecovery()) return { session: null, error: null };
  const auth = await waitForAuthInstance();
  if (!auth) return { session: null, error: null };

  const maxAttempts = isLikelyFirebaseOAuthReturnUrl() ? 24 : 8;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (auth.currentUser) {
      const session = await sessionFromCurrentUser();
      if (session?.user) {
        clearOAuthRedirectPending();
        return { session, error: null };
      }
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return { session: null, error: null };
}

/** Last-chance capture before showing login again (Landing / AuthCallback). */
export async function finalizeOAuthRedirectCapture(): Promise<OAuthRedirectCapture> {
  if (!shouldTryOAuthRecovery()) return { session: null, error: null };
  let captured = await awaitOAuthRedirectCapture();
  if (captured.session?.user || captured.error) return captured;
  captured = await recoverOAuthSessionIfSignedIn();
  return captured;
}

if (typeof window !== 'undefined') {
  clearStaleOAuthRedirectPending();

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      capturePromise = null;
      captureOAuthRedirectOnLoad();
    }
  });
}
