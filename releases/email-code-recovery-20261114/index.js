import { onCall } from 'firebase-functions/v2/https';
import { db, auth } from './lib/_shared/admin.js';
import { verifyEmailChallenge } from './lib/_shared/emailChallengeAuthority.js';
export const auth2faVerify = onCall({ cors: true, invoker: 'public', timeoutSeconds: 60 }, async (request) => verifyEmailChallenge(db, auth, request.auth?.uid || null, request.data || {}));
