import { createHash } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, validAudienceId } from './profileAudienceAuthority.js';
export const followAuthorityId = (ownerUid, followerUid) => createHash('sha256').update(JSON.stringify(['follow', ownerUid, followerUid])).digest('hex');
const states = ['pending', 'active', 'declined', 'cancelled', 'removed'];
const actions = ['state', 'list', 'request', 'approve', 'decline', 'remove', 'unfollow'];
const hexId = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validRevision = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
function validProof(row, id) {
    return !!row && row.version === 1 && validAudienceId(row.owner_uid) && validAudienceId(row.follower_uid)
        && validAudienceId(row.owner_profile_id) && validAudienceId(row.follower_profile_id)
        && row.owner_uid !== row.follower_uid && id === followAuthorityId(row.owner_uid, row.follower_uid)
        && typeof row.status === 'string' && states.includes(row.status) && validRevision(row.revision) && row.revision > 0
        && typeof row.approved_by_owner === 'boolean';
}
export function hasCurrentFollow(row, owner, follower) {
    return validProof(row, followAuthorityId(owner.uid, follower.uid)) && row.owner_uid === owner.uid && row.owner_profile_id === owner.profileId
        && row.follower_uid === follower.uid && row.follower_profile_id === follower.profileId && row.status === 'active';
}
export function hasApprovedFollow(row, owner, follower) {
    return hasCurrentFollow(row, owner, follower) && row?.approved_by_owner === true;
}
export function normalizeFollowInput(raw, uid) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new HttpsError('invalid-argument', 'Follow details are required.');
    const row = raw;
    if (row.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen this view.');
    if (!validAudienceId(row.expectedProfileId) || typeof row.action !== 'string' || !actions.includes(row.action))
        throw new HttpsError('invalid-argument', 'Invalid follow request.');
    const allowed = ['expectedOwnerUid', 'expectedProfileId', 'action'];
    if (row.action === 'list') {
        allowed.push('view', 'cursor');
        if (typeof row.view !== 'string' || !['requests', 'followers'].includes(row.view) || (row.cursor !== undefined && !hexId(row.cursor)))
            throw new HttpsError('invalid-argument', 'Invalid follow list.');
    }
    else if (row.action === 'state' || row.action === 'request') {
        allowed.push('targetId');
        if (!validAudienceId(row.targetId))
            throw new HttpsError('invalid-argument', 'Choose an account.');
    }
    else {
        allowed.push('relationshipId');
        if (!hexId(row.relationshipId))
            throw new HttpsError('invalid-argument', 'Choose a saved follow relationship.');
    }
    if (!['state', 'list'].includes(row.action)) {
        allowed.push('revision');
        if (!validRevision(row.revision))
            throw new HttpsError('invalid-argument', 'Refresh this follow relationship.');
    }
    if (Object.keys(row).some(key => !allowed.includes(key)))
        throw new HttpsError('invalid-argument', 'Unexpected follow details.');
    return row;
}
const stale = () => new HttpsError('failed-precondition', 'This follow relationship changed. Refresh and retry.');
const presentation = (identity, fallback) => ({ id: identity?.profileId ?? fallback,
    username: typeof identity?.row.username === 'string' ? identity.row.username.slice(0, 128) : '',
    displayName: typeof identity?.row.display_name === 'string' ? identity.row.display_name.slice(0, 200) : null });
export async function manageFollowAuthority(db, uid, raw) {
    const input = normalizeFollowInput(raw, uid);
    return db.runTransaction(async (tx) => {
        const actor = await resolveIdentity(db, tx, uid);
        if (!actor || actor.uid !== uid || actor.profileId !== input.expectedProfileId)
            throw stale();
        const base = { ownerUid: uid, profileId: actor.profileId, action: input.action };
        if (input.action === 'list') {
            let query = db.collection('_follow_authority').where('owner_uid', '==', uid).where('status', '==', input.view === 'requests' ? 'pending' : 'active')
                .orderBy(FieldPath.documentId()).limit(21);
            if (input.cursor)
                query = query.startAfter(input.cursor);
            const snapshot = await tx.get(query);
            const selected = snapshot.docs.slice(0, 20);
            const relationships = [];
            for (const doc of selected) {
                const row = doc.data();
                if (!validProof(row, doc.id) || row.owner_uid !== uid)
                    continue;
                const follower = await resolveIdentity(db, tx, row.follower_uid);
                const current = follower?.profileId === row.follower_profile_id && actor.profileId === row.owner_profile_id;
                relationships.push({ relationshipId: doc.id, revision: row.revision, status: row.status,
                    approvedByOwner: row.approved_by_owner, canApprove: !!current && row.status === 'pending',
                    follower: presentation(current ? follower : null, row.follower_profile_id) });
            }
            return { ...base, view: input.view, relationships, nextCursor: snapshot.size > 20 ? selected.at(-1).id : null };
        }
        let owner = null;
        let follower = null;
        let id;
        const ownerAction = ['approve', 'decline', 'remove'].includes(input.action);
        if (input.action === 'state' || input.action === 'request') {
            owner = await resolveIdentity(db, tx, input.targetId);
            follower = actor;
            if (!owner || owner.uid === uid || owner.profileId !== input.targetId)
                throw stale();
            id = followAuthorityId(owner.uid, uid);
        }
        else
            id = input.relationshipId;
        const ref = db.collection('_follow_authority').doc(id);
        const snapshot = await tx.get(ref);
        const saved = snapshot.data();
        if (saved && !validProof(saved, id))
            throw stale();
        if (!owner) {
            if (!saved || saved[ownerAction ? 'owner_uid' : 'follower_uid'] !== uid)
                throw new HttpsError('permission-denied', 'This follow relationship is not yours.');
            owner = ownerAction ? actor : await resolveIdentity(db, tx, saved.owner_uid);
            follower = ownerAction ? await resolveIdentity(db, tx, saved.follower_uid) : actor;
        }
        const current = owner && follower && (!saved || (saved.owner_uid === owner.uid && saved.owner_profile_id === owner.profileId
            && saved.follower_uid === follower.uid && saved.follower_profile_id === follower.profileId));
        let blocked = false;
        if (owner && follower) {
            const blocks = await Promise.all([
                tx.get(db.collection('blocked_users').where('blocker_id', 'in', owner.aliases).where('blocked_id', 'in', follower.aliases).limit(1)),
                tx.get(db.collection('blocked_users').where('blocker_id', 'in', follower.aliases).where('blocked_id', 'in', owner.aliases).limit(1)),
            ]);
            blocked = blocks.some(result => !result.empty);
        }
        const privateAccount = owner?.row.is_private === true;
        if (owner && owner.row.is_private != null && typeof owner.row.is_private !== 'boolean')
            throw stale();
        const state = (row) => {
            const matches = owner && follower && row?.owner_uid === owner.uid && row.owner_profile_id === owner.profileId
                && row.follower_uid === follower.uid && row.follower_profile_id === follower.profileId;
            return matches && !blocked && row?.status === 'active' && (!privateAccount || row.approved_by_owner === true)
                ? 'following' : matches && !blocked && row?.status === 'pending' ? 'pending' : 'none';
        };
        const result = (row) => ({ ...base, relationshipId: id, revision: row?.revision ?? 0,
            state: state(row), targetId: owner?.profileId ?? saved?.owner_profile_id, privateAccount, blocked });
        if (input.action === 'state')
            return result(saved);
        if (input.revision !== (saved?.revision ?? 0))
            throw stale();
        const granting = input.action === 'request' || input.action === 'approve';
        if (granting && (!owner || !follower || blocked))
            throw new HttpsError('permission-denied', 'This account cannot be followed right now.');
        if (input.action === 'approve' && (!current || saved?.status !== 'pending'))
            throw stale();
        if (input.action === 'decline' && saved?.status !== 'pending')
            throw stale();
        if (input.action === 'remove' && saved?.status !== 'active')
            throw stale();
        if (input.action === 'unfollow' && !['pending', 'active'].includes(String(saved?.status)))
            throw stale();
        if (input.action === 'request' && current && !blocked && ['following', 'pending'].includes(state(saved)))
            return result(saved);
        // A bounded cleanup of legacy projections never makes their contents proof.
        const ownerAliases = owner?.aliases ?? [saved.owner_uid, saved.owner_profile_id];
        const followerAliases = follower?.aliases ?? [saved.follower_uid, saved.follower_profile_id];
        const legacy = await tx.get(db.collection('follows').where('following_id', 'in', [...new Set(ownerAliases)])
            .where('follower_id', 'in', [...new Set(followerAliases)]).limit(101));
        if (legacy.size > 100)
            throw new HttpsError('resource-exhausted', 'This follow relationship needs repair. Contact support.');
        const status = input.action === 'request' ? privateAccount ? 'pending' : 'active'
            : input.action === 'approve' ? 'active' : input.action === 'decline' ? 'declined' : input.action === 'remove' ? 'removed' : 'cancelled';
        const now = new Date().toISOString();
        const updated = { version: 1, owner_uid: owner?.uid ?? saved.owner_uid, owner_profile_id: owner?.profileId ?? saved.owner_profile_id,
            follower_uid: follower?.uid ?? saved.follower_uid, follower_profile_id: follower?.profileId ?? saved.follower_profile_id,
            status, approved_by_owner: input.action === 'approve', revision: Number(input.revision) + 1, created_at: saved?.created_at ?? now, updated_at: now };
        tx.set(ref, updated);
        for (const doc of legacy.docs)
            tx.delete(doc.ref);
        if (status === 'active')
            tx.set(db.collection('follows').doc(`verified_${id}`), { follower_id: updated.follower_profile_id, following_id: updated.owner_profile_id,
                authority_id: id, created_at: now });
        if (input.action === 'request')
            tx.create(db.collection('notifications').doc(`follow_${id}_${updated.revision}`), {
                user_id: updated.owner_profile_id, actor_id: updated.follower_profile_id,
                type: status === 'pending' ? 'follow_request' : 'follow', read: false, created_at: now,
                ...(status === 'pending' ? { deep_link: '/settings?tab=privacy' } : {}),
            });
        return result(updated);
    });
}
//# sourceMappingURL=followAuthority.js.map