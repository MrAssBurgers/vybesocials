import { getRedirectResult } from 'firebase/auth';
import { firebaseAuth } from './authService';
import type { VybeSession, VybeAuthError } from './types';

export type OAuthRedirectCapture = {
  session: VybeSession | null;
  error: VybeAuthError | null;
};

let capturePromise: Promise<OAuthRedirectCapture> | null = null;

function isOAuthReturnPending(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem('vybe-oauth-pending') === 'true';
}

/** Start getRedirectResult as early as possible (before React mounts). */
export function captureOAuthRedirectOnLoad(): Promise<OAuthRedirectCapture> {
  if (capturePromise) return capturePromise;

  capturePromise = (async (): Promise<OAuthRedirectCapture> => {
    const auth = firebaseAuth.auth;
    if (!auth) return { session: null, error: null };

    try {
      const result = await getRedirectResult(auth);
      if (!result?.user) return { session: null, error: null };

      const { data } = await firebaseAuth.getSession();
      if (data.session?.user) {
        return { session: data.session, error: null };
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
  if (isOAuthReturnPending()) {
    captureOAuthRedirectOnLoad();
  }
}
