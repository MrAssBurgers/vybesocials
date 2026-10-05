import { onCall } from 'firebase-functions/v2/https';
import { db, requireAuth } from './_shared/admin.js';
import { manageSignInPreferences as manage } from './_shared/signInPreferencesAuthority.js';

export const manageSignInPreferences = onCall({ cors: true, timeoutSeconds: 30 }, request => manage(db, requireAuth(request), request.data));
