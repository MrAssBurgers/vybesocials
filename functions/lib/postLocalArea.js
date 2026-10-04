import { onCall } from 'firebase-functions/v2/https';
import { db, enforceRateLimit, rateLimit, requireAuth } from './_shared/admin.js';
import { closeFriendAuthorityId } from './_shared/profileAudienceAuthority.js';
import { normalizePostLocalAreaInput, managePostLocalAreaAuthority } from './_shared/postLocalAreaAuthority.js';
export const managePostLocalArea = onCall({ region: 'us-central1', timeoutSeconds: 60 }, async (request) => {
    const uid = requireAuth(request);
    normalizePostLocalAreaInput(request.data, uid);
    enforceRateLimit(await rateLimit(`post-local:${closeFriendAuthorityId(uid, 'manage')}`, 30, 60));
    return managePostLocalAreaAuthority(db, uid, request.data);
});
//# sourceMappingURL=postLocalArea.js.map