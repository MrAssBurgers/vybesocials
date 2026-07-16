/**
 * Runs before the Firebase auth client initializes so localStorage is
 * repaired/migrated before auth reads persisted sessions.
 */
import { clearObsoleteAuthStorage, repairLegacyAuthStorage } from './legacyAuthStorage';
import { isPasswordRecoveryUrl, redirectToPasswordRecoveryPage } from './passwordRecoveryUrl';
import { clearStaleOAuthRedirectPending } from '@/lib/firebase/oauthRedirect';

// #region agent log — first module in the import chain
try {
  fetch('https://us-central1-vybe-daaab.cloudfunctions.net/authQr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        action: 'debug_oauth',
        event: 'boot_import_chain_start',
        hypothesisId: 'H-boot',
        location: 'bootstrapAuthStorage.ts:top',
        payload: {
          host: typeof location !== 'undefined' ? location.hostname : '',
        },
      },
    }),
    keepalive: true,
  }).catch(() => {});
} catch {
  /* ignore */
}
// #endregion

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
