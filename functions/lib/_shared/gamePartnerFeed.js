import { HttpsError } from 'firebase-functions/v2/https';
import { db } from './admin.js';
import { authorizePartner, PARTNER_FEED_SCOPE, PartnerError } from './gamePartnerCore.js';
import { resolveIdentity } from './profileAudienceAuthority.js';
import { readSocialFeedPage } from './socialFeedAuthority.js';
export async function readPartnerPublicFeed(token, query) {
    if (Object.keys(query).some(key => !['cursor', 'contentType'].includes(key))
        || (query.cursor !== undefined && (typeof query.cursor !== 'string' || !/^[a-f0-9]{48}$/.test(query.cursor)))
        || (query.contentType !== undefined && !['post', 'short', 'video'].includes(query.contentType))) {
        throw new PartnerError(400, 'invalid_request', 'Choose a supported feed page.');
    }
    const identity = await db.runTransaction(async (tx) => {
        const principal = await authorizePartner(tx, token, PARTNER_FEED_SCOPE);
        const viewer = await resolveIdentity(db, tx, principal.uid);
        if (!viewer || viewer.uid !== principal.uid)
            throw new PartnerError(403, 'access_denied', 'Your VYBE profile is unavailable.');
        return { ...principal, profileId: viewer.profileId };
    });
    let expiresAt = identity.expiresAt;
    const page = await readSocialFeedPage(db, identity.uid, {
        expectedOwnerUid: identity.uid, expectedProfileId: identity.profileId,
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        ...(query.contentType === undefined ? {} : { contentType: query.contentType }),
    }, Date.now(), {
        connectionId: identity.connectionId,
        authorize: async (tx) => {
            const current = await authorizePartner(tx, token, PARTNER_FEED_SCOPE);
            expiresAt = Math.min(expiresAt, current.expiresAt);
            if (current.uid !== identity.uid || current.connectionId !== identity.connectionId || current.clientId !== identity.clientId) {
                throw new PartnerError(401, 'invalid_token', 'Link this integration again.');
            }
        },
    }).catch(error => {
        if (error instanceof HttpsError && error.code === 'failed-precondition')
            throw new PartnerError(409, 'feed_changed', 'Refresh the feed to continue.');
        throw error;
    });
    if (expiresAt <= Date.now())
        throw new PartnerError(401, 'invalid_token', 'This connection expired. Link again.');
    return {
        connectionId: identity.connectionId, expiresAt,
        contentType: page.contentType, nextCursor: page.nextCursor,
        posts: page.posts.map(post => ({
            id: post.id, type: post.type, caption: post.caption, createdAt: post.createdAt,
            mediaUrl: post.mediaUrl, mediaUrls: post.mediaUrls, thumbnailUrl: post.thumbnailUrl,
            ageRating: post.ageRating, likeCount: post.likeCount, commentCount: post.commentCount,
            viewCount: post.viewCount, tags: post.tags, author: post.author,
        })),
    };
}
//# sourceMappingURL=gamePartnerFeed.js.map