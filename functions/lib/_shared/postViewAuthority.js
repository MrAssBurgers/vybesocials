import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, validAudienceId } from './profileAudienceAuthority.js';
import { admitSocialPost } from './socialFeedAuthority.js';
import { publicationHash, validPublicationPostId } from './postPublicationProof.js';
export function normalizePostViewInput(raw, uid) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new HttpsError('invalid-argument', 'A post is required.');
    const value = raw;
    if (value.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen this post.');
    if (!validAudienceId(value.expectedProfileId) || !validPublicationPostId(value.postId)
        || Object.keys(value).some(key => !['expectedOwnerUid', 'expectedProfileId', 'postId'].includes(key)))
        throw new HttpsError('invalid-argument', 'A valid post selection is required.');
    return value;
}
/** Count observed playback, not unique humans or verified watch time. Admission
 * is checked again on every replay; the receipt never grants content access. */
export async function recordPostViewFor(db, uid, raw, now = Date.now()) {
    const input = normalizePostViewInput(raw, uid);
    if (!validAudienceId(uid) || !Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000 - 7_200_000)
        throw new HttpsError('failed-precondition', 'View recording is unavailable.');
    const minute = Math.floor(now / 60_000), hour = Math.floor(now / 3_600_000);
    const limitRef = db.collection('_post_view_limits').doc(publicationHash([uid, minute]));
    // Denied lookups and duplicate attempts consume the same bounded request quota.
    await db.runTransaction(async (tx) => {
        const old = (await tx.get(limitRef)).data();
        if (old && (old.version !== 1 || old.owner_uid !== uid || old.minute !== minute || !Number.isSafeInteger(old.requests) || old.requests < 0))
            throw new HttpsError('failed-precondition', 'View recording needs repair.');
        if ((old?.requests ?? 0) >= 60)
            throw new HttpsError('resource-exhausted', 'Too many view requests. Try again shortly.');
        tx.set(limitRef, { version: 1, owner_uid: uid, minute, requests: (old?.requests ?? 0) + 1, expireAt: Timestamp.fromMillis((minute + 1) * 60_000 + 7_200_000) });
    });
    return db.runTransaction(async (tx) => {
        const viewer = await resolveIdentity(db, tx, uid);
        if (!viewer || viewer.uid !== uid || viewer.profileId !== input.expectedProfileId)
            throw new HttpsError('failed-precondition', 'Your profile changed. Reopen this post.');
        const admitted = await admitSocialPost(db, tx, viewer, input.postId);
        if (!admitted || admitted.needsOwnerConfirmation)
            throw new HttpsError('permission-denied', 'This post is unavailable.');
        const receiptRef = db.collection('_post_view_receipts').doc(publicationHash([uid, input.postId, hour]));
        const prior = (await tx.get(receiptRef)).data();
        if (prior && (prior.version !== 1 || prior.viewer_uid !== uid || prior.viewer_profile_id !== viewer.profileId || prior.post_id !== input.postId || prior.hour !== hour))
            throw new HttpsError('failed-precondition', 'This view receipt needs repair.');
        if (!Number.isSafeInteger(admitted.viewCount) || admitted.viewCount < 0 || admitted.viewCount >= Number.MAX_SAFE_INTEGER)
            throw new HttpsError('failed-precondition', 'This view count is unavailable.');
        const counted = !prior, viewCount = admitted.viewCount + (counted ? 1 : 0);
        if (counted) {
            // update, never set/merge: a concurrently deleted post cannot be recreated.
            tx.update(db.collection('posts').doc(input.postId), { view_count: viewCount });
            tx.create(receiptRef, { version: 1, viewer_uid: uid, viewer_profile_id: viewer.profileId, post_id: input.postId, hour, counted_at: Timestamp.fromMillis(now), expireAt: Timestamp.fromMillis((hour + 2) * 3_600_000) });
        }
        return { ok: true, ownerUid: uid, profileId: viewer.profileId, postId: input.postId, viewCount, counted };
    });
}
//# sourceMappingURL=postViewAuthority.js.map