import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, validAudienceId } from './profileAudienceAuthority.js';
import { isLocalArea } from './localArea.js';
export function normalizePostLocalAreaInput(raw, uid) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new HttpsError('invalid-argument', 'Local sharing details are required.');
    const row = raw;
    if (row.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen this post.');
    if (!validAudienceId(row.expectedProfileId) || !validAudienceId(row.postId)
        || !['state', 'share', 'remove'].includes(row.action)
        || Object.keys(row).some(key => !['expectedOwnerUid', 'expectedProfileId', 'postId', 'action', 'revision', 'area'].includes(key))
        || (row.action === 'share' ? !isLocalArea(row.area) : row.area !== undefined)
        || (row.action === 'state' ? row.revision !== undefined : !Number.isSafeInteger(row.revision) || Number(row.revision) < 0 || Number(row.revision) >= Number.MAX_SAFE_INTEGER - 1)) {
        throw new HttpsError('invalid-argument', 'Invalid Local sharing selection.');
    }
    return row;
}
export function validPostLocalProof(row, owner, postId) {
    return !!row && row.version === 1 && row.owner_uid === owner.uid && row.profile_id === owner.profileId && row.post_id === postId
        && Number.isSafeInteger(row.revision) && Number(row.revision) > 0 && Number(row.revision) < Number.MAX_SAFE_INTEGER
        && typeof row.enabled === 'boolean' && (row.enabled ? isLocalArea(row.area) : row.area === null);
}
export async function managePostLocalAreaAuthority(db, uid, raw) {
    const input = normalizePostLocalAreaInput(raw, uid);
    return db.runTransaction(async (tx) => {
        const owner = await resolveIdentity(db, tx, uid);
        if (!owner || owner.uid !== uid || owner.profileId !== input.expectedProfileId)
            throw new HttpsError('failed-precondition', 'Your profile changed. Reopen this post.');
        const post = (await tx.get(db.collection('posts').doc(input.postId))).data();
        if (!post || !owner.aliases.includes(post.author_id) || (post.user_id !== undefined && !owner.aliases.includes(post.user_id))) {
            throw new HttpsError('permission-denied', 'Only the author can change Local sharing.');
        }
        const reference = db.collection('_post_local_areas').doc(input.postId);
        const proof = (await tx.get(reference)).data();
        if (proof && !validPostLocalProof(proof, owner, input.postId))
            throw new HttpsError('failed-precondition', 'Local sharing needs repair. Please contact support.');
        let revision = Number(proof?.revision ?? 0), enabled = proof?.enabled === true;
        if (input.action !== 'state') {
            if (input.revision !== revision)
                throw new HttpsError('failed-precondition', 'Local sharing changed. Reopen this post before trying again.');
            if (input.action === 'share' && (post.deleted_at || post.is_deleted || post.is_hidden || post.is_removed || post.removed_at
                || (post.status !== undefined && post.status !== 'published')))
                throw new HttpsError('failed-precondition', 'Only a published post can be shared to Local.');
            revision++;
            enabled = input.action === 'share';
            tx.set(reference, { version: 1, owner_uid: uid, profile_id: owner.profileId, post_id: input.postId,
                revision, enabled, area: enabled ? input.area : null, updated_at: Timestamp.now() });
        }
        // Location is deliberately absent even from the owner's presentation receipt.
        return { ownerUid: uid, profileId: owner.profileId, postId: input.postId, action: input.action, revision, enabled };
    });
}
//# sourceMappingURL=postLocalAreaAuthority.js.map