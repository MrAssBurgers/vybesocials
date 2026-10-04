import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
export const validAudienceId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');
export const closeFriendAuthorityId = (ownerUid, friendUid) => createHash('sha256').update(JSON.stringify([ownerUid, friendUid])).digest('hex');
export function hasCloseFriendAuthority(row, author, viewer) {
    return row?.version === 1 && row.owner_uid === author.uid && row.owner_profile_id === author.profileId
        && row.friend_uid === viewer.uid && row.friend_profile_id === viewer.profileId && row.enabled === true;
}
/** Resolve both historical aliases without borrowing a different account's ID. */
export async function resolveIdentity(db, tx, alias) {
    if (!validAudienceId(alias))
        return null;
    const [direct, byUid] = await Promise.all([tx.get(db.collection('profiles').doc(alias)), tx.get(db.collection('profiles').where('user_id', '==', alias).limit(2))]);
    if (byUid.size > 1 || (direct.exists && !byUid.empty && direct.id !== byUid.docs[0].id))
        return null;
    const profile = direct.exists ? direct : byUid.docs[0];
    if (!profile)
        return null;
    const row = profile.data();
    const uid = row.user_id;
    if (!validAudienceId(uid) || row.deleted_at || row.is_deleted === true)
        return null;
    const [unique, index, uidDoc, aliasOwner] = await Promise.all([
        tx.get(db.collection('profiles').where('user_id', '==', uid).limit(2)), tx.get(db.collection('user_auth_index').doc(uid)),
        tx.get(db.collection('profiles').doc(uid)), tx.get(db.collection('profiles').where('user_id', '==', profile.id).limit(2)),
    ]);
    if (unique.size !== 1 || unique.docs[0].id !== profile.id || (index.exists && index.data()?.profile_id !== profile.id)
        || (uidDoc.exists && uidDoc.id !== profile.id) || (profile.id !== uid && !aliasOwner.empty))
        return null;
    return { uid, profileId: profile.id, aliases: [...new Set([uid, profile.id])], row };
}
export const PROFILE_VISIBILITY_DEFAULTS = {
    bio: 'friends', followers: 'public', following: 'public', level: 'friends', activity: 'friends', location: 'friends',
    posts: 'public', clips: 'public', stories: 'friends', mutual_friends: 'friends', vybe_dna: 'friends',
};
const allowedLevels = new Set(['public', 'everyone', 'friends', 'close_friends', 'only_me', 'private']);
export function normalizeProfileVisibilityRequest(raw, uid) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new HttpsError('invalid-argument', 'Profile visibility details are required.');
    const input = raw;
    if (input.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen this profile.');
    if (!validAudienceId(input.expectedProfileId) || !validAudienceId(input.target_id)
        || Object.keys(input).some(key => !['expectedOwnerUid', 'expectedProfileId', 'target_id'].includes(key)))
        throw new HttpsError('invalid-argument', 'A valid profile selection is required.');
    return input;
}
/** Return only known settings; malformed stored preferences never imply access. */
export function normalizedProfileSettings(row, targetId) {
    const fields = row?.fields;
    const validMap = fields !== null && typeof fields === 'object' && !Array.isArray(fields);
    const malformed = !!row && ((!validMap) || (row.id !== undefined && row.id !== targetId) || (row.user_id !== undefined && row.user_id !== targetId));
    const result = {};
    for (const [field, fallback] of Object.entries(PROFILE_VISIBILITY_DEFAULTS)) {
        const level = row && validMap && Object.hasOwn(fields, field) ? fields[field] : fallback;
        result[field] = !malformed && typeof level === 'string' && allowedLevels.has(level) ? level : 'unavailable';
    }
    return result;
}
/** Fresh section permissions only; this is not a raw profile/post data reader. */
export async function resolveProfileAudience(db, uid, raw) {
    const input = normalizeProfileVisibilityRequest(raw, uid);
    return db.runTransaction(async (tx) => {
        const [viewer, target] = await Promise.all([resolveIdentity(db, tx, uid), resolveIdentity(db, tx, input.target_id)]);
        if (!viewer || viewer.uid !== uid || viewer.profileId !== input.expectedProfileId)
            throw new HttpsError('failed-precondition', 'Your profile identity changed. Refresh and retry.');
        if (!target || target.profileId !== input.target_id)
            throw new HttpsError('failed-precondition', 'This profile identity could not be verified. Reopen the profile.');
        const self = viewer.uid === target.uid;
        const settingsSnapshot = await tx.get(db.collection('profile_visibility').doc(target.profileId));
        const settings = normalizedProfileSettings(settingsSnapshot.data(), target.profileId);
        let friend = false;
        let blocked = false;
        let close = false;
        if (!self) {
            const [outgoing, incoming, viewerBlock, targetBlock, proof] = await Promise.all([
                tx.get(db.collection('friend_requests').where('sender_id', 'in', viewer.aliases).where('receiver_id', 'in', target.aliases).where('status', '==', 'accepted').limit(1)),
                tx.get(db.collection('friend_requests').where('sender_id', 'in', target.aliases).where('receiver_id', 'in', viewer.aliases).where('status', '==', 'accepted').limit(1)),
                tx.get(db.collection('blocked_users').where('blocker_id', 'in', viewer.aliases).where('blocked_id', 'in', target.aliases).limit(1)),
                tx.get(db.collection('blocked_users').where('blocker_id', 'in', target.aliases).where('blocked_id', 'in', viewer.aliases).limit(1)),
                tx.get(db.collection('_close_friend_authority').doc(closeFriendAuthorityId(target.uid, viewer.uid))),
            ]);
            blocked = !viewerBlock.empty || !targetBlock.empty;
            friend = !blocked && (!outgoing.empty || !incoming.empty);
            close = friend && hasCloseFriendAuthority(proof.data(), target, viewer);
        }
        const fields = {};
        for (const [field, level] of Object.entries(settings)) {
            fields[field] = level !== 'unavailable' && !blocked && (self || level === 'public' || level === 'everyone'
                || (level === 'friends' && friend) || (level === 'close_friends' && close));
        }
        return { ok: true, ownerUid: uid, viewerProfileId: viewer.profileId, targetProfileId: target.profileId,
            fields, settings, isSelf: self, isFriend: friend, isBlocked: blocked };
    });
}
//# sourceMappingURL=profileAudienceAuthority.js.map