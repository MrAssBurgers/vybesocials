/**
 * Runs before the Firebase auth client initializes so localStorage is
 * repaired/migrated before auth reads persisted sessions.
 */
import { clearObsoleteAuthStorage, repairLegacyAuthStorage } from './legacyAuthStorage';
import { ensureAuthStorageReady } from './authSessionMirror';
import { getFirebaseConfig, isFirebaseConfigured } from './firebase/config';
import { isPasswordRecoveryUrl, redirectToPasswordRecoveryPage } from './passwordRecoveryUrl';
import { clearStaleOAuthRedirectPending } from '@/lib/firebase/oauthRedirect';
import { isLocalPreview } from './firebase/localPreview';

if (typeof window !== 'undefined') {
  try {
    if (isPasswordRecoveryUrl()) {
      redirectToPasswordRecoveryPage();
    }
  } catch {
    /* ignore malformed URL */
  }
}

// The isolated demo must never migrate, repair or seed normal login backups.
const localPreview = isLocalPreview();
if (!localPreview) {
  clearObsoleteAuthStorage();
  repairLegacyAuthStorage();
  clearStaleOAuthRedirectPending();
}

if (!localPreview && typeof window !== 'undefined' && isFirebaseConfigured()) {
  try {
    void ensureAuthStorageReady(getFirebaseConfig().apiKey, navigator.userAgent || '');
  } catch {
    /* auth still starts; a missing key just means a fresh sign-in */
  }
}
