import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, requireAuth } from './_shared/admin.js';
import { areFriends, expiresAtForDuration, friendshipPairId, isBlocked, resolveProfileId, } from './_shared/friendship.js';
async function assertCanShareLocation(a, b) {
    if (a === b)
        throw new HttpsError('invalid-argument', 'Cannot share with self');
    if (await isBlocked(a, b))
        throw new HttpsError('permission-denied', 'Blocked');
    if (!(await areFriends(a, b)))
        throw new HttpsError('permission-denied', 'Friends only');
}
export const createLocationRequest = onCall({ region: 'us-central1' }, async (request) => {
    const authUid = requireAuth(request);
    const profileId = await resolveProfileId(authUid);
    const data = (request.data || {});
    const targetId = String(data.target_id || data.targetId || '');
    const duration = String(data.duration || '1h');
    const precision = String(data.precision || 'approximate');
    const message = typeof data.message === 'string' ? data.message.slice(0, 200) : null;
    const customMinutes = Number(data.custom_minutes || data.customMinutes || 0);
    if (!targetId)
        throw new HttpsError('invalid-argument', 'target_id required');
    await assertCanShareLocation(profileId, targetId);
    const now = new Date().toISOString();
    const ref = db.collection('location_requests').doc();
    const expiresAt = expiresAtForDuration(duration, customMinutes);
    await ref.set({
        id: ref.id,
        requester_id: profileId,
        target_id: targetId,
        duration,
        precision,
        message,
        status: 'pending',
        expires_at: expiresAt,
        created_at: now,
        updated_at: now,
    });
    return { ok: true, request_id: ref.id };
});
export const respondLocationRequest = onCall({ region: 'us-central1' }, async (request) => {
    const authUid = requireAuth(request);
    const profileId = await resolveProfileId(authUid);
    const data = (request.data || {});
    const requestId = String(data.request_id || data.requestId || '');
    const intent = String(data.intent || 'decline');
    const duration = String(data.duration || '');
    const customMinutes = Number(data.custom_minutes || 0);
    if (!requestId)
        throw new HttpsError('invalid-argument', 'request_id required');
    const reqRef = db.collection('location_requests').doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists)
        throw new HttpsError('not-found', 'Request not found');
    const req = reqSnap.data();
    if (req.target_id !== profileId)
        throw new HttpsError('permission-denied', 'Not your request');
    if (req.status !== 'pending')
        return { ok: true, status: req.status };
    const now = new Date().toISOString();
    if (intent === 'decline' || intent === 'block') {
        await reqRef.update({ status: intent === 'block' ? 'blocked' : 'declined', updated_at: now });
        return { ok: true, status: intent === 'block' ? 'blocked' : 'declined' };
    }
    const shareDuration = (duration || req.duration || '1h');
    const expiresAt = expiresAtForDuration(shareDuration, customMinutes);
    const pairId = friendshipPairId(profileId, String(req.requester_id));
    const sharerId = profileId;
    const viewerId = String(req.requester_id);
    const liveSnap = await db.collection('user_live_locations').doc(sharerId).get();
    const live = liveSnap.data();
    await db.collection('location_shares').doc(pairId).set({
        id: pairId,
        pair_id: pairId,
        sharer_id: sharerId,
        viewer_id: viewerId,
        precision: req.precision || 'approximate',
        duration: shareDuration,
        active: true,
        paused: false,
        expires_at: expiresAt,
        last_latitude: live?.latitude ?? null,
        last_longitude: live?.longitude ?? null,
        last_accuracy: live?.accuracy ?? null,
        last_activity_type: live?.activity_type ?? null,
        last_battery_percent: live?.battery_percent ?? null,
        last_updated_at: live?.updated_at ?? now,
        created_at: now,
        updated_at: now,
    }, { merge: true });
    await reqRef.update({ status: 'accepted', updated_at: now, responded_at: now });
    return { ok: true, status: 'accepted', pair_id: pairId, expires_at: expiresAt };
});
export const stopLocationShare = onCall({ region: 'us-central1' }, async (request) => {
    const authUid = requireAuth(request);
    const profileId = await resolveProfileId(authUid);
    const data = (request.data || {});
    const otherId = String(data.other_profile_id || data.otherProfileId || '');
    if (!otherId)
        throw new HttpsError('invalid-argument', 'other_profile_id required');
    const pairId = friendshipPairId(profileId, otherId);
    const ref = db.collection('location_shares').doc(pairId);
    const snap = await ref.get();
    if (!snap.exists)
        return { ok: true };
    const row = snap.data();
    if (row.sharer_id !== profileId && row.viewer_id !== profileId) {
        throw new HttpsError('permission-denied', 'Not in this share');
    }
    await ref.update({ active: false, paused: false, updated_at: new Date().toISOString() });
    return { ok: true };
});
export const pauseLocationShare = onCall({ region: 'us-central1' }, async (request) => {
    const authUid = requireAuth(request);
    const profileId = await resolveProfileId(authUid);
    const data = (request.data || {});
    const otherId = String(data.other_profile_id || '');
    const paused = data.paused !== false;
    if (!otherId)
        throw new HttpsError('invalid-argument', 'other_profile_id required');
    const pairId = friendshipPairId(profileId, otherId);
    const ref = db.collection('location_shares').doc(pairId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.sharer_id !== profileId) {
        throw new HttpsError('permission-denied', 'Not the sharer');
    }
    await ref.update({ paused, updated_at: new Date().toISOString() });
    return { ok: true, paused };
});
/** Sync permitted location snapshots from live locations (scheduled). */
export const syncLocationShareSnapshots = onSchedule({ schedule: 'every 5 minutes', region: 'us-central1' }, async () => {
    const now = new Date().toISOString();
    const snap = await db.collection('location_shares')
        .where('active', '==', true)
        .where('paused', '==', false)
        .limit(80)
        .get();
    for (const doc of snap.docs) {
        const row = doc.data();
        if (row.expires_at && String(row.expires_at) < now) {
            await doc.ref.update({ active: false, updated_at: now });
            continue;
        }
        const sharerId = String(row.sharer_id || '');
        if (!sharerId)
            continue;
        const live = await db.collection('user_live_locations').doc(sharerId).get();
        if (!live.exists)
            continue;
        const l = live.data();
        if (!l.sharing_enabled || l.is_ghost)
            continue;
        await doc.ref.update({
            last_latitude: l.latitude ?? null,
            last_longitude: l.longitude ?? null,
            last_accuracy: l.accuracy ?? null,
            last_activity_type: l.activity_type ?? null,
            last_battery_percent: l.battery_percent ?? null,
            last_updated_at: l.updated_at ?? now,
            updated_at: now,
        });
    }
});
//# sourceMappingURL=locationSharing.js.map