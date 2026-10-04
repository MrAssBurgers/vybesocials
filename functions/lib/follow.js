import { onCall } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { followAuthorityId, manageFollowAuthority, normalizeFollowInput } from './_shared/followAuthority.js';
export const manageFollow = onCall({ region: 'us-central1' }, async (request) => {
    const uid = requireAuth(request);
    normalizeFollowInput(request.data, uid);
    enforceRateLimit(await rateLimit(`follow:${followAuthorityId(uid, 'rate')}`, 90, 60));
    if (request.data.action === 'request')
        enforceRateLimit(await rateLimit(`follow-request:${followAuthorityId(uid, request.data.targetId)}`, 10, 3600));
    return manageFollowAuthority(db, uid, request.data);
});
//# sourceMappingURL=follow.js.map