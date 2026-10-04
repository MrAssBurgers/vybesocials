import { onCall } from 'firebase-functions/v2/https';
import { db, enforceRateLimit, rateLimit, requireAuth } from './_shared/admin.js';
import { closeFriendAuthorityId } from './_shared/profileAudienceAuthority.js';
import { normalizeSocialFeedInput, readSocialFeedPage } from './_shared/socialFeedAuthority.js';
export const readSocialFeed = onCall({ region: 'us-central1', timeoutSeconds: 60 }, async (request) => {
    const uid = requireAuth(request);
    normalizeSocialFeedInput(request.data, uid);
    enforceRateLimit(await rateLimit(`social-feed:${closeFriendAuthorityId(uid, 'read')}`, 30, 60));
    return readSocialFeedPage(db, uid, request.data);
});
//# sourceMappingURL=socialFeed.js.map