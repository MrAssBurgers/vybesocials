import { getRedirectResult } from 'firebase/auth';
import { firebaseAuth } from './authService';
import type { VybeSession, VybeAuthError } from './types';

export type OAuthRedirectCapture = {
  session: VybeSession | null;
  error: VybeAuthError | null;
};

const OAUTH_PENDING_KEY = 'vybe-oauth-pending';
const OAUTH_PENDING_AT_KEY = 'vybe-oauth-pending-at';
const OAUTH_PENDING_MAX_MS = 3 * 60 * 1000;
const OAUTH_REDIRECT_TIMEOUT_MS = 8000;

let capturePromise: Promise<OAuthRedirectCapture> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('OAuth redirect timed out')), ms);
    }),
  ]);
}

export function markOAuthRedirectPending(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(OAUTH_PENDING_KEY, 'true');
  sessionStorage.setItem(OAUTH_PENDING_AT_KEY, String(Date.now()));
}

export function clearOAuthRedirectPending(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(OAUTH_PENDING_KEY);
  sessionStorage.removeItem(OAUTH_PENDING_AT_KEY);
}

/** Drop stale flags left from abandoned OAuth attempts (prevents auth init hang). */
export function clearStaleOAuthRedirectPending(): void {
  if (typeof sessionStorage === 'undefined') return;
  if (sessionStorage.getItem(OAUTH_PENDING_KEY) !== 'true') return;
  const at = Number(sessionStorage.getItem(OAUTH_PENDING_AT_KEY) || '0');
  if (!at || Date.now() - at > OAUTH_PENDING_MAX_MS) {
    clearOAuthRedirectPending();
  }
}

function isOAuthReturnPending(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  if (sessionStorage.getItem(OAUTH_PENDING_KEY) !== 'true') return false;
  const at = Number(sessionStorage.getItem(OAUTH_PENDING_AT_KEY) || '0');
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
      const result = await withTimeout(getRedirectResult(auth), OAUTH_REDIRECT_TIMEOUT_MS);
      if (!result?.user) return { session: null, error: null };

      const { data: userData } = await firebaseAuth.getUser();
      if (userData.user) {
        return {
          session: {
            user: userData.user,
            access_token: '',
            refresh_token: result.user.refreshToken,
          },
          error: null,
        };
      }

      return { session: null, error: { message: 'OAuth redirect completed without session' } };
    } catch (err) {
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
  if (isOAuthReturnPending()) {
    captureOAuthRedirectOnLoad();
  }
}
