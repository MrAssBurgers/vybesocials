import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, enforceRateLimit, rateLimit, requireAuth } from './_shared/admin.js';
import { areFriends, friendshipPairId, isBlocked, resolveProfileId, } from './_shared/friendship.js';
function requestId(senderId, receiverId) {
    return `${senderId}_${receiverId}`;
}
function validProfileId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 160;
}
async function findLegacyRequest(senderId, receiverId) {
    // Prefer accepted, then pending — random UUID docs can coexist for the same pair.
    const accepted = await db.collection('friend_requests')
        .where('sender_id', '==', senderId)
        .where('receiver_id', '==', receiverId)
        .where('status', '==', 'accepted')
        .limit(1)
        .get();
    if (!accepted.empty)
        return accepted.docs[0];
    const pending = await db.collection('friend_requests')
        .where('sender_id', '==', senderId)
        .where('receiver_id', '==', receiverId)
        .where('status', '==', 'pending')
        .limit(1)
        .get();
    return pending.docs[0] ?? null;
}
function pickBestRequest(deterministic, legacy) {
    const candidates = [deterministic, legacy].filter((snap) => Boolean(snap?.exists));
    const accepted = candidates.find((snap) => String(snap.data()?.status) === 'accepted');
    if (accepted)
        return accepted;
    const pending = candidates.find((snap) => String(snap.data()?.status) === 'pending');
    if (pending)
        return pending;
    return candidates[0] ?? null;
}
async function loadPairRequests(profileId, otherId) {
    const outboundRef = db.collection('friend_requests').doc(requestId(profileId, otherId));
    const inboundRef = db.collection('friend_requests').doc(requestId(otherId, profileId));
    const [outbound, inbound, legacyOutbound, legacyInbound] = await Promise.all([
        outboundRef.get(),
        inboundRef.get(),
        findLegacyRequest(profileId, otherId),
        findLegacyRequest(otherId, profileId),
    ]);
    // Always merge deterministic + legacy. Early-return on deterministic-only used to
    // hide a legacy `accepted` behind a newer deterministic `pending`, so Add stayed
    // visible until send returned "already friends".
    return {
        outbound: pickBestRequest(outbound.exists ? outbound : null, legacyOutbound),
        inbound: pickBestRequest(inbound.exists ? inbound : null, legacyInbound),
    };
}
function canonicalPairState(profileId, outbound, inbound) {
    const rows = [outbound, inbound]
        .filter((snap) => !!snap?.exists)
        .map((snap) => ({ id: snap.id, ...snap.data() }));
    const accepted = rows.find((row) => row.status === 'accepted');
    if (accepted)
        return { state: 'accepted', request_id: accepted.id };
    const pending = rows.find((row) => row.status === 'pending');
    if (pending) {
        return {
            state: pending.sender_id === profileId ? 'pending_outgoing' : 'pending_incoming',
            request_id: pending.id,
        };
    }
    const inactive = rows.find((row) => row.status === 'declined' || row.status === 'cancelled');
    return inactive
        ? { state: inactive.status, request_id: inactive.id }
        : { state: 'none', request_id: null };
}
/** Authoritative friendship state, including block checks hidden from client queries. */
export const getFriendshipState = onCall({ region: 'us-central1', invoker: 'public' }, async (request) => {
    const authUid = requireAuth(request);
    const profileId = await resolveProfileId(authUid);
    const otherId = (request.data || {}).target_profile_id;
    if (!validProfileId(otherId))
        throw new HttpsError('invalid-argument', 'target_profile_id required');
    if (otherId === profileId)
        return { state: 'none', request_id: null };
    if (await isBlocked(profileId, otherId))
        return { state: 'blocked', request_id: null };
    const { outbound, inbound } = await loadPairRequests(profileId, otherId);
    return canonicalPairState(profileId, outbound, inbound);
});
/**
 * Canonical friendship mutation boundary. Admin SDK writes intentionally bypass
 * client rules; every identity check and state transition is enforced here.
 */
export const mutateFriendship = onCall({ region: 'us-central1', invoker: 'public' }, async (request) => {
    const authUid = requireAuth(request);
    const profileId = await resolveProfileId(authUid);
    const data = (request.data || {});
    const action = data.action;
    if (!['send', 'cancel', 'accept', 'decline', 'unfriend'].includes(action)) {
        throw new HttpsError('invalid-argument', 'Invalid friendship action');
    }
    const now = new Date().toISOString();
    if (action === 'send') {
        const otherId = data.target_profile_id;
        if (!validProfileId(otherId))
            throw new HttpsError('invalid-argument', 'target_profile_id required');
        if (otherId === profileId)
            throw new HttpsError('failed-precondition', 'Cannot friend yourself');
        const target = await db.collection('profiles').doc(otherId).get();
        if (!target.exists)
            throw new HttpsError('not-found', 'User not found');
        if (await isBlocked(profileId, otherId))
            throw new HttpsError('permission-denied', 'Friend request blocked');
        enforceRateLimit(await rateLimit(`friend-request:${profileId}`, 20, 60));
        const outboundRef = db.collection('friend_requests').doc(requestId(profileId, otherId));
        const inboundRef = db.collection('friend_requests').doc(requestId(otherId, profileId));
        const [legacyOutbound, legacyInbound] = await Promise.all([
            findLegacyRequest(profileId, otherId),
            findLegacyRequest(otherId, profileId),
        ]);
        const legacyActive = [legacyOutbound, legacyInbound].find((snap) => snap && ['pending', 'accepted'].includes(String(snap.data().status)));
        if (legacyActive && legacyActive.id !== outboundRef.id && legacyActive.id !== inboundRef.id) {
            const legacyStatus = String(legacyActive.data().status);
            const legacyState = legacyStatus === 'accepted'
                ? 'accepted'
                : String(legacyActive.data().sender_id) === profileId
                    ? 'pending_outgoing'
                    : 'pending_incoming';
            return {
                ok: true,
                already_exists: true,
                state: legacyState,
                request_id: legacyActive.id,
                verified: true,
            };
        }
        const result = await db.runTransaction(async (tx) => {
            const [outbound, inbound, blockedBySender, blockedByReceiver] = await Promise.all([
                tx.get(outboundRef),
                tx.get(inboundRef),
                tx.get(db.collection('blocked_users')
                    .where('blocker_id', '==', profileId)
                    .where('blocked_id', '==', otherId)
                    .limit(1)),
                tx.get(db.collection('blocked_users')
                    .where('blocker_id', '==', otherId)
                    .where('blocked_id', '==', profileId)
                    .limit(1)),
            ]);
            if (!blockedBySender.empty || !blockedByReceiver.empty) {
                throw new HttpsError('permission-denied', 'Friend request blocked');
            }
            const active = [outbound, inbound].find((snap) => snap.exists && ['pending', 'accepted'].includes(String(snap.data()?.status)));
            if (active) {
                const status = String(active.data()?.status);
                const state = status === 'accepted'
                    ? 'accepted'
                    : String(active.data()?.sender_id) === profileId
                        ? 'pending_outgoing'
                        : 'pending_incoming';
                return { already_exists: true, request_id: active.id, state };
            }
            tx.set(outboundRef, {
                id: outboundRef.id,
                sender_id: profileId,
                receiver_id: otherId,
                status: 'pending',
                created_at: outbound.data()?.created_at || now,
                updated_at: now,
            });
            return { already_exists: false, request_id: outboundRef.id, state: 'pending_outgoing' };
        });
        if (!result.already_exists) {
            await db.collection('notifications').add({
                user_id: otherId,
                actor_id: profileId,
                type: 'friend_request',
                created_at: now,
                read: false,
            }).catch((error) => console.warn('[Friendship] request notification failed', error));
        }
        const confirmed = await db.collection('friend_requests').doc(result.request_id).get();
        const confirmedRow = confirmed.data();
        const verified = Boolean(confirmed.exists &&
            confirmedRow?.sender_id &&
            confirmedRow?.receiver_id &&
            ['pending', 'accepted'].includes(String(confirmedRow.status)));
        if (!verified) {
            throw new HttpsError('internal', 'Friend request write could not be confirmed');
        }
        return {
            ok: true,
            ...result,
            state: result.state || 'pending_outgoing',
            verified: true,
        };
    }
    const suppliedRequestId = data.request_id;
    if (!validProfileId(suppliedRequestId))
        throw new HttpsError('invalid-argument', 'request_id required');
    const ref = db.collection('friend_requests').doc(suppliedRequestId);
    if (action === 'accept') {
        const before = await ref.get();
        const beforeRow = before.data();
        if (beforeRow?.receiver_id === profileId &&
            validProfileId(beforeRow.sender_id) &&
            await isBlocked(profileId, beforeRow.sender_id)) {
            throw new HttpsError('permission-denied', 'Friend request blocked');
        }
    }
    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw new HttpsError('not-found', 'Friend request not found');
        const row = snap.data();
        if (!validProfileId(row.sender_id) || !validProfileId(row.receiver_id)) {
            throw new HttpsError('failed-precondition', 'Invalid friend request');
        }
        if (action === 'cancel') {
            if (row.sender_id !== profileId || row.status !== 'pending') {
                throw new HttpsError('permission-denied', 'Only the sender can cancel a pending request');
            }
            tx.update(ref, { status: 'cancelled', updated_at: now });
            return { state: 'cancelled', other_id: row.receiver_id };
        }
        if (action === 'accept' || action === 'decline') {
            if (row.receiver_id !== profileId || row.status !== 'pending') {
                throw new HttpsError('permission-denied', 'Only the receiver can respond to a pending request');
            }
            if (action === 'accept') {
                const [blockedByReceiver, blockedBySender] = await Promise.all([
                    tx.get(db.collection('blocked_users')
                        .where('blocker_id', '==', profileId)
                        .where('blocked_id', '==', row.sender_id)
                        .limit(1)),
                    tx.get(db.collection('blocked_users')
                        .where('blocker_id', '==', row.sender_id)
                        .where('blocked_id', '==', profileId)
                        .limit(1)),
                ]);
                if (!blockedByReceiver.empty || !blockedBySender.empty) {
                    throw new HttpsError('permission-denied', 'Friend request blocked');
                }
            }
            tx.update(ref, {
                status: action === 'accept' ? 'accepted' : 'declined',
                updated_at: now,
            });
            return {
                state: action === 'accept' ? 'accepted' : 'declined',
                other_id: row.sender_id,
            };
        }
        if (row.status !== 'accepted' ||
            (row.sender_id !== profileId && row.receiver_id !== profileId)) {
            throw new HttpsError('permission-denied', 'Only friends can unfriend');
        }
        tx.delete(ref);
        return {
            state: 'none',
            other_id: row.sender_id === profileId ? row.receiver_id : row.sender_id,
        };
    });
    if (action === 'accept' || action === 'decline') {
        await db.collection('notifications').add({
            user_id: result.other_id,
            actor_id: profileId,
            type: action === 'accept' ? 'friend_accepted' : 'friend_declined',
            created_at: now,
            read: false,
        }).catch((error) => console.warn('[Friendship] response notification failed', error));
    }
    if (action === 'accept' && result.other_id) {
        try {
            const { recordRelationshipActivity } = await import('./relationshipEngine.js');
            await recordRelationshipActivity({
                actorId: profileId,
                friendId: result.other_id,
                eventType: 'friend_added',
                sourceId: suppliedRequestId,
                occurredAt: now,
            });
            await recordRelationshipActivity({
                actorId: result.other_id,
                friendId: profileId,
                eventType: 'friend_added',
                sourceId: `${suppliedRequestId}:reverse`,
                occurredAt: now,
            });
            const { applyVybeScoreEvent } = await import('./vybeScore.js');
            await applyVybeScoreEvent({
                userId: profileId,
                eventType: 'friend_accepted',
                sourceId: suppliedRequestId,
                idempotencyKey: `friend:${suppliedRequestId}:accepter`,
            });
            await applyVybeScoreEvent({
                userId: result.other_id,
                eventType: 'friend_accepted',
                sourceId: `${suppliedRequestId}:sender`,
                idempotencyKey: `friend:${suppliedRequestId}:sender`,
            });
        }
        catch (err) {
            console.warn('[Friendship] relationship/score hook failed', err);
        }
    }
    return { ok: true, request_id: suppliedRequestId, ...result };
});
const DEFAULT_VISIBILITY = {
    bio: 'friends',
    followers: 'public',
    following: 'public',
    level: 'friends',
    activity: 'friends',
    location: 'friends',
    posts: 'public',
    clips: 'public',
    stories: 'friends',
    mutual_friends: 'friends',
    vybe_dna: 'friends',
};
async function countMessagesBetween(a, b) {
    const convSnap = await db.collection('conversations')
        .where('member_ids', 'array-contains', a)
        .limit(40)
        .get();
    let count = 0;
    for (const doc of convSnap.docs) {
        const members = doc.data().member_ids || [];
        if (!members.includes(b) || members.length !== 2)
            continue;
        const msgSnap = await db.collection('messages')
            .where('conversation_id', '==', doc.id)
            .limit(200)
            .get();
        count += msgSnap.size;
    }
    return count;
}
export async function refreshFriendshipPairStatsCore(profileA, profileB) {
    if (!(await areFriends(profileA, profileB)))
        return null;
    const pairId = friendshipPairId(profileA, profileB);
    const [userA, userB] = profileA < profileB ? [profileA, profileB] : [profileB, profileA];
    const now = new Date().toISOString();
    const outbound = `${profileA}_${profileB}`;
    const inbound = `${profileB}_${profileA}`;
    const [outSnap, inSnap] = await Promise.all([
        db.collection('friend_requests').doc(outbound).get(),
        db.collection('friend_requests').doc(inbound).get(),
    ]);
    const fr = outSnap.data()?.status === 'accepted' ? outSnap.data() : inSnap.data();
    const friendsSince = fr?.updated_at || fr?.created_at || now;
    const messageCount = await countMessagesBetween(profileA, profileB);
    const pinsSnap = await db.collection('message_pins')
        .where('user_id', 'in', [profileA, profileB])
        .limit(100)
        .get();
    const savedMemoryCount = pinsSnap.size;
    const existing = await db.collection('friendship_pairs').doc(pairId).get();
    const prev = existing.data() || {};
    const row = {
        id: pairId,
        user_a: userA,
        user_b: userB,
        friends_since: friendsSince,
        message_count: messageCount,
        snap_count: Number(prev.snap_count || 0),
        call_count: Number(prev.call_count || 0),
        shared_clip_count: Number(prev.shared_clip_count || 0),
        saved_memory_count: savedMemoryCount,
        current_streak: Number(prev.current_streak || 0),
        longest_streak: Number(prev.longest_streak || 0),
        friendship_level: Number(prev.friendship_level || 1),
        updated_at: now,
    };
    await db.collection('friendship_pairs').doc(pairId).set(row, { merge: true });
    return row;
}
export const refreshFriendshipPairStats = onCall({ region: 'us-central1' }, async (request) => {
    const authUid = requireAuth(request);
    const profileId = await resolveProfileId(authUid);
    const data = (request.data || {});
    const otherId = String(data.other_profile_id || data.otherProfileId || '');
    if (!otherId)
        throw new HttpsError('invalid-argument', 'other_profile_id required');
    if (await isBlocked(profileId, otherId))
        throw new HttpsError('permission-denied', 'Blocked');
    const row = await refreshFriendshipPairStatsCore(profileId, otherId);
    if (!row)
        throw new HttpsError('failed-precondition', 'Not friends');
    return { ok: true, pair: row };
});
export const scheduledRefreshFriendshipPairs = onSchedule({ schedule: 'every 6 hours', region: 'us-central1' }, async () => {
    const snap = await db.collection('friend_requests')
        .where('status', '==', 'accepted')
        .limit(60)
        .get();
    for (const doc of snap.docs) {
        const d = doc.data();
        const a = String(d.sender_id || '');
        const b = String(d.receiver_id || '');
        if (!a || !b)
            continue;
        try {
            await refreshFriendshipPairStatsCore(a, b);
        }
        catch {
            /* skip pair */
        }
    }
});
export const resolveProfileVisibility = onCall({ region: 'us-central1' }, async (request) => {
    const authUid = requireAuth(request);
    const viewerId = await resolveProfileId(authUid);
    const data = (request.data || {});
    const targetId = String(data.target_id || data.targetId || '');
    if (!targetId)
        throw new HttpsError('invalid-argument', 'target_id required');
    const visSnap = await db.collection('profile_visibility').doc(targetId).get();
    const settings = { ...DEFAULT_VISIBILITY, ...(visSnap.data()?.fields || {}) };
    const isSelf = viewerId === targetId;
    const friends = isSelf || (await areFriends(viewerId, targetId));
    const resolved = {};
    for (const [field, level] of Object.entries(settings)) {
        if (level === 'public' || level === 'everyone')
            resolved[field] = true;
        else if (level === 'only_me' || level === 'private')
            resolved[field] = isSelf;
        else if (level === 'friends' || level === 'close_friends')
            resolved[field] = friends;
        else
            resolved[field] = friends;
    }
    return { ok: true, fields: resolved, settings };
});
export const indexSharedContent = onCall({ region: 'us-central1' }, async (request) => {
    const authUid = requireAuth(request);
    const profileId = await resolveProfileId(authUid);
    const data = (request.data || {});
    const otherId = String(data.other_profile_id || '');
    const contentType = String(data.content_type || 'post');
    const contentId = String(data.content_id || '');
    const title = typeof data.title === 'string' ? data.title.slice(0, 120) : null;
    const thumbnailUrl = typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null;
    if (!otherId || !contentId)
        throw new HttpsError('invalid-argument', 'other_profile_id and content_id required');
    if (!(await areFriends(profileId, otherId)))
        throw new HttpsError('permission-denied', 'Friends only');
    const pairId = friendshipPairId(profileId, otherId);
    const now = new Date().toISOString();
    const docId = `${pairId}_${contentType}_${contentId}`;
    await db.collection('shared_content_index').doc(docId).set({
        id: docId,
        pair_id: pairId,
        user_a: profileId < otherId ? profileId : otherId,
        user_b: profileId < otherId ? otherId : profileId,
        shared_by: profileId,
        content_type: contentType,
        content_id: contentId,
        title,
        thumbnail_url: thumbnailUrl,
        created_at: now,
        updated_at: now,
    }, { merge: true });
    return { ok: true, id: docId };
});
//# sourceMappingURL=friendProfile.js.map