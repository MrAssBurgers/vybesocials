/**
 * Shared Auth facade — keep pages/buttons thin.
 * Implementation lives under src/lib/firebase + nativeOAuth (single Auth instance).
 */
import { firebaseAuth, getFirebaseAuth } from '@/lib/firebase/authService';
import { completeOAuthRedirectOnce } from '@/lib/firebase/oauthRedirect';
import { signInWithOAuthPlatform, isOAuthBusy } from '@/lib/nativeOAuth';
import { getFriendlyAuthError } from '@/lib/errorUtils';
import { claimProfileAfterOAuth } from '@/lib/oauthAccountLink';
import type { VybeSession } from '@/lib/firebase/types';

export { getFriendlyAuthError, isOAuthBusy, claimProfileAfterOAuth };

export async function signInWithGoogle() {
  return signInWithOAuthPlatform('google');
}

export async function signInWithApple() {
  return signInWithOAuthPlatform('apple');
}

export async function completeOAuthRedirect() {
  return completeOAuthRedirectOnce();
}

export async function signOutUser() {
  return firebaseAuth.signOut();
}

export function subscribeToAuthState(
  callback: (event: string, session: VybeSession | null) => void,
) {
  return firebaseAuth.onAuthStateChange(callback);
}

export function getAuthInstance() {
  return getFirebaseAuth();
}
