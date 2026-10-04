import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { normalizeStoryPublishInput, publishStoryWithReceipt, storyRequestKey } from './_shared/storyPublishAuthority.js';
import { listVisibleStoriesForViewer, normalizeStoryListInput } from './_shared/storyReadAuthority.js';
import { manageVerifiedCloseFriends } from './_shared/closeFriendAuthority.js';
export const publishStory = onCall({ region: 'us-central1', invoker: 'public', memory: '256MiB', timeoutSeconds: 60, cors: true }, async (request) => {
    const uid = requireAuth(request);
    normalizeStoryPublishInput(request.data, uid);
    enforceRateLimit(await rateLimit(`story-publish:${storyRequestKey(uid, 'rate', 'all')}`, 30, 60));
    return publishStoryWithReceipt(db, uid, request.data);
});
export const listVisibleStories = onCall({ region: 'us-central1', invoker: 'public', memory: '256MiB', timeoutSeconds: 60, cors: true }, async (request) => {
    const uid = requireAuth(request);
    normalizeStoryListInput(request.data, uid);
    enforceRateLimit(await rateLimit(`story-list:${storyRequestKey(uid, 'rate', 'all')}`, 60, 60));
    return listVisibleStoriesForViewer(db, uid, request.data);
});
export const manageCloseFriends = onCall({ region: 'us-central1', invoker: 'public', memory: '256MiB', timeoutSeconds: 60, cors: true }, async (request) => {
    const uid = requireAuth(request);
    if (request.data?.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen close friends.');
    enforceRateLimit(await rateLimit(`close-friends:${storyRequestKey(uid, 'rate', 'all')}`, 60, 60));
    return manageVerifiedCloseFriends(db, uid, request.data);
});
//# sourceMappingURL=storyPublish.js.map