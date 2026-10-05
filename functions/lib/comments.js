import { onCall } from 'firebase-functions/v2/https';
import { db, enforceRateLimit, rateLimit, requireAuth } from './_shared/admin.js';
import { closeFriendAuthorityId } from './_shared/profileAudienceAuthority.js';
import { readPostCommentsPage, readPostCommentCountsPage, readCommentContextPage, runManagePostComment } from './_shared/commentAuthority.js';
const callable = (name, run, limit = 90) => onCall({ region: 'us-central1', timeoutSeconds: 60 }, async (request) => {
    const uid = requireAuth(request);
    enforceRateLimit(await rateLimit(`comments:${name}:${closeFriendAuthorityId(uid, name)}`, limit, 60));
    return run(db, uid, request.data);
});
export const readPostComments = callable('read', readPostCommentsPage);
export const readPostCommentCounts = callable('counts', readPostCommentCountsPage);
export const readCommentContext = callable('context', readCommentContextPage);
export const managePostComment = callable('change', runManagePostComment, 60);
//# sourceMappingURL=comments.js.map