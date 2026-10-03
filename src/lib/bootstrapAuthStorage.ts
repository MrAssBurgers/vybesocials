/**
 * Runs before the Firebase auth client initializes so localStorage is
 * repaired/migrated before auth reads persisted sessions.
 */
import { clearObsoleteAuthStorage, repairLegacyAuthStorage } from './legacyAuthStorage';
import { ensureAuthStorageReady } from './authSessionMirror';
import { getFirebaseConfig, isFirebaseConfigured } from './firebase/config';
import { isPasswordRecoveryUrl, redirectToPasswordRecoveryPage } from './passwordRecoveryUrl';
import { clearStaleOAuthRedirectPending } from '@/lib/firebase/oauthRedirect';

if (typeof window !== 'undefined') {
  try {
    if (isPasswordRecoveryUrl()) {
      redirectToPasswordRecoveryPage();
    }
  } catch {
    /* ignore malformed URL */
  }
}

clearObsoleteAuthStorage();
repairLegacyAuthStorage();
clearStaleOAuthRedirectPending();

if (typeof window !== 'undefined' && isFirebaseConfigured()) {
  try {
    void ensureAuthStorageReady(getFirebaseConfig().apiKey, navigator.userAgent || '');
  } catch {
    /* auth still starts; a missing key just means a fresh sign-in */
  }
}
