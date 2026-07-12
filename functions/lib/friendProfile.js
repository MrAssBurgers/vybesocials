import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, requireAuth } from './_shared/admin.js';
import { areFriends, friendshipPairId, isBlocked, resolveProfileId, } from './_shared/friendship.js';
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