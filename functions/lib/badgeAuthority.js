import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAdmin, enforceRateLimit, rateLimit } from './_shared/admin.js';
import { rewardDocumentId } from './_shared/challengeRewardAuthority.js';
const review = () => new HttpsError('failed-precondition', 'This badge or account needs reconciliation. Please contact support.');
/** Staff authorization is performed by the callable. All target resolution and
 * grant changes share a transaction; a badge never creates a role grant. */
export async function changeBadgeGrant(database, staffUid, input, operation, nowMs = Date.now()) {
    const targetId = rewardDocumentId(input.p_user_id);
    const badgeId = rewardDocumentId(input.p_badge_id);
    let expiry = null;
    if (operation === 'award' && input.p_expires_at != null) {
        if (typeof input.p_expires_at !== 'string' || input.p_expires_at.length > 40)
            throw new HttpsError('invalid-argument', 'Invalid badge expiry');
        const timestamp = Date.parse(input.p_expires_at);
        if (!Number.isFinite(timestamp) || timestamp <= nowMs)
            throw new HttpsError('invalid-argument', 'Badge expiry must be in the future');
        expiry = new Date(timestamp).toISOString();
    }
    return database.runTransaction(async (tx) => {
        const [direct, byUid, definition] = await Promise.all([
            tx.get(database.collection('profiles').doc(targetId)),
            tx.get(database.collection('profiles').where('user_id', '==', targetId).limit(2)),
            tx.get(database.collection('badges').doc(badgeId)),
        ]);
        if (byUid.size > 1 || (direct.exists && byUid.size && byUid.docs[0].id !== direct.id))
            throw review();
        const profile = direct.exists ? direct : byUid.docs[0];
        if (!profile)
            throw new HttpsError('not-found', 'Account not found');
        const uid = rewardDocumentId(profile.data()?.user_id);
        const aliases = [...new Set([uid, profile.id])];
        const [duplicates, index, grants, canonical] = await Promise.all([
            tx.get(database.collection('profiles').where('user_id', '==', uid).limit(2)),
            tx.get(database.collection('user_auth_index').doc(uid)),
            tx.get(database.collection('user_badges').where('user_id', 'in', aliases).where('badge_id', '==', badgeId).limit(21)),
            tx.get(database.collection('user_badges').doc(`${uid}_${badgeId}`)),
        ]);
        if (duplicates.size !== 1 || duplicates.docs[0].id !== profile.id || (index.exists && index.data()?.profile_id !== profile.id))
            throw review();
        if (grants.size > 20)
            throw review();
        if (canonical.exists && (!aliases.includes(String(canonical.data()?.user_id)) || canonical.data()?.badge_id !== badgeId))
            throw review();
        if (operation === 'revoke') {
            // Deleting all matching legacy aliases prevents a duplicate imported row
            // from keeping a revoked badge visible. Repeated removal is a no-op.
            for (const grant of grants.docs)
                tx.delete(grant.ref);
            return { success: true, removed: grants.size };
        }
        if (!definition.exists)
            throw new HttpsError('not-found', 'Badge not found');
        if (grants.size > 1)
            throw review();
        if (grants.size)
            return { success: true, id: grants.docs[0].id, already_awarded: true };
        const ref = database.collection('user_badges').doc(`${uid}_${badgeId}`);
        tx.create(ref, {
            id: ref.id, user_id: uid, badge_id: badgeId, earned_at: new Date(nowMs).toISOString(), expires_at: expiry,
            is_pinned: false, pin_order: null, is_primary: false, show_effect: true,
            awarded_by: staffUid, grant_source: 'staff',
        });
        return { success: true, id: ref.id, already_awarded: false };
    });
}
export const awardBadge = onCall({ cors: true, invoker: 'public' }, async (request) => {
    const uid = await requireAdmin(request);
    enforceRateLimit(await rateLimit(`badge-admin:${uid}`, 60, 60));
    return changeBadgeGrant(db, uid, request.data || {}, 'award');
});
export const revokeBadge = onCall({ cors: true, invoker: 'public' }, async (request) => {
    const uid = await requireAdmin(request);
    enforceRateLimit(await rateLimit(`badge-admin:${uid}`, 60, 60));
    return changeBadgeGrant(db, uid, request.data || {}, 'revoke');
});
//# sourceMappingURL=badgeAuthority.js.map