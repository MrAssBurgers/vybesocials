import { onCall } from 'firebase-functions/v2/https';
import { db, enforceRateLimit, rateLimit, requireAuth } from './_shared/admin.js';
import { closeFriendAuthorityId } from './_shared/profileAudienceAuthority.js';
import { normalizeSocialFeedInput, normalizeSocialPostPreviewsInput, readSocialFeedPage, readSocialPostPreviewsPage } from './_shared/socialFeedAuthority.js';
import { normalizeSocialPostListInput, readSocialPostListPage } from './_shared/socialPostListAuthority.js';
export const readSocialPostList = onCall({ region: 'us-central1', timeoutSeconds: 60 }, async (request) => {
    const uid = requireAuth(request);
    normalizeSocialPostListInput(request.data, uid);
    enforceRateLimit(await rateLimit(`social-post-list:${closeFriendAuthorityId(uid, 'read')}`, 120, 60));
    return readSocialPostListPage(db, uid, request.data);
});
export const readSocialPostPreviews = onCall({ region: 'us-central1', timeoutSeconds: 60 }, async (request) => {
    const uid = requireAuth(request);
    normalizeSocialPostPreviewsInput(request.data, uid);
    enforceRateLimit(await rateLimit(`social-post-previews:${closeFriendAuthorityId(uid, 'read')}`, 30, 60));
    return readSocialPostPreviewsPage(db, uid, request.data);
});
export const readSocialFeed = onCall({ region: 'us-central1', timeoutSeconds: 60 }, async (request) => {
    const uid = requireAuth(request);
    normalizeSocialFeedInput(request.data, uid);
    enforceRateLimit(await rateLimit(`social-feed:${closeFriendAuthorityId(uid, 'read')}`, 30, 60));
    return readSocialFeedPage(db, uid, request.data);
});
//# sourceMappingURL=socialFeed.js.map