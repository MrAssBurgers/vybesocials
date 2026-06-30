/**
 * Runs before the Firebase auth client initializes so localStorage is
 * repaired/migrated before auth reads persisted sessions.
 */
import { clearObsoleteAuthStorage, repairLegacyAuthStorage } from './legacyAuthStorage';
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
