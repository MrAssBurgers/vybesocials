import { getRedirectResult } from 'firebase/auth';
import { firebaseAuth } from './authService';
import type { VybeSession, VybeAuthError } from './types';
import { isMobileOrTabletDevice } from '@/lib/deviceDetection';

export type OAuthRedirectCapture = {
  session: VybeSession | null;
  error: VybeAuthError | null;
};

const OAUTH_PENDING_KEY = 'vybe-oauth-pending';
const OAUTH_PENDING_AT_KEY = 'vybe-oauth-pending-at';
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

function readPendingAt(): number {
  if (typeof window === 'undefined') return 0;
  const fromSession = Number(sessionStorage.getItem(OAUTH_PENDING_AT_KEY) || '0');
  if (fromSession) return fromSession;
  try {
    return Number(localStorage.getItem(OAUTH_PENDING_AT_KEY) || '0');
  } catch {
    return 0;
  }
}

function isPendingFlagSet(): boolean {
  if (typeof window === 'undefined') return false;
  if (sessionStorage.getItem(OAUTH_PENDING_KEY) === 'true') return true;
  try {
    return localStorage.getItem(OAUTH_PENDING_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markOAuthRedirectPending(): void {
  if (typeof window === 'undefined') return;
  const at = String(Date.now());
  sessionStorage.setItem(OAUTH_PENDING_KEY, 'true');
  sessionStorage.setItem(OAUTH_PENDING_AT_KEY, at);
  try {
    localStorage.setItem(OAUTH_PENDING_KEY, 'true');
    localStorage.setItem(OAUTH_PENDING_AT_KEY, at);
  } catch {
    /* ignore */
  }
}

export function clearOAuthRedirectPending(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(OAUTH_PENDING_KEY);
  sessionStorage.removeItem(OAUTH_PENDING_AT_KEY);
  try {
    localStorage.removeItem(OAUTH_PENDING_KEY);
    localStorage.removeItem(OAUTH_PENDING_AT_KEY);
  } catch {
    /* ignore */
  }
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

/** Start getRedirectResult as early as possible (before React mounts). */
export function captureOAuthRedirectOnLoad(): Promise<OAuthRedirectCapture> {
  if (capturePromise) return capturePromise;

  capturePromise = (async (): Promise<OAuthRedirectCapture> => {
    const auth = firebaseAuth.auth;
    if (!auth) return { session: null, error: null };

    try {
      const result = await withTimeout(getRedirectResult(auth), getOAuthRedirectTimeoutMs());
      if (!result?.user) return { session: null, error: null };

      const { data: sessionData } = await firebaseAuth.getSession();
      if (sessionData.session?.user) {
        clearOAuthRedirectPending();
        return { session: sessionData.session, error: null };
      }

      return { session: null, error: { message: 'OAuth redirect completed without session' } };
    } catch (err) {
      if (isPendingFlagSet()) clearOAuthRedirectPending();
      const message = err instanceof Error ? err.message : 'OAuth redirect failed';
      return {
        session: null,
        error: { message, name: (err as { code?: string }).code },
      };
    }
  })();

  return capturePromise;
}

export function awaitOAuthRedirectCapture(): Promise<OAuthRedirectCapture> {
  return captureOAuthRedirectOnLoad();
}

export function isOAuthRedirectInFlight(): boolean {
  return isOAuthReturnPending();
}

if (typeof window !== 'undefined') {
  clearStaleOAuthRedirectPending();
  // Always probe Firebase redirect result on boot — sessionStorage pending flag is often
  // cleared during the Google round-trip on mobile Safari.
  captureOAuthRedirectOnLoad();

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      capturePromise = null;
      captureOAuthRedirectOnLoad();
    }
  });
}
