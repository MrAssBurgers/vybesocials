import { onCall } from 'firebase-functions/v2/https';
import { auth, db, enforceRateLimit, rateLimit, requireAuth } from './_shared/admin.js';
import { manageLoginStreakForUid } from './_shared/loginStreakAuthority.js';
export const manageLoginStreak = onCall({ region: 'us-central1', timeoutSeconds: 60 }, async (request) => {
    const uid = requireAuth(request);
    enforceRateLimit(await rateLimit(`login-streak:${uid}`, 60, 60));
    return manageLoginStreakForUid(db, auth, uid, request.data);
});
//# sourceMappingURL=loginStreak.js.map