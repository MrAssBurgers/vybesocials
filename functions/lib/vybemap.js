/**
 * VybeMap Cloud Functions — location abuse detection, heatmap aggregation, meetup notifications.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { getOrResearchLocationIntel } from './_shared/mapLocationIntel.js';
const INTEL_SECRETS = ['GEMINI_API_KEY'];
/** Rate-limit location access — anti-stalking. */
export const logMapAccess = onCall(async (request) => {
    const uid = requireAuth(request);
    const { targetProfileId, action } = (request.data || {});
    if (!targetProfileId || !action)
        throw new HttpsError('invalid-argument', 'targetProfileId & action required');
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const recent = await db.collection('map_access_rate').doc(`${uid}_${targetProfileId}`).get();
    const count = recent.data()?.count || 0;
    if (count > 60)
        throw new HttpsError('resource-exhausted', 'Too many location requests — try again later');
    await db.collection('map_access_rate').doc(`${uid}_${targetProfileId}`).set({
        count: count + 1,
        last_action: action,
        updated_at: new Date().toISOString(),
        window_start: recent.data()?.window_start || hourAgo,
    }, { merge: true });
    return { ok: true };
});
/** Aggregate heatmap cells from live locations (privacy-safe grid). */
export const aggregateVybeHeatmap = onSchedule('every 15 minutes', async () => {
    const snap = await db.collection('user_live_locations').where('sharing_enabled', '==', true).limit(500).get();
    const buckets = new Map();
    snap.docs.forEach((doc) => {
        const d = doc.data();
        const prefix = (d.geohash || '').slice(0, 5);
        if (!prefix || d.latitude == null || d.longitude == null)
            return;
        const cur = buckets.get(prefix) || { lat: d.latitude, lng: d.longitude, n: 0 };
        cur.n += 1;
        buckets.set(prefix, cur);
    });
    const batch = db.batch();
    buckets.forEach((v, prefix) => {
        const ref = db.collection('heatmap_tiles').doc(prefix);
        batch.set(ref, {
            geohash_prefix: prefix,
            cell_latitude: v.lat,
            cell_longitude: v.lng,
            intensity: Math.min(100, v.n * 8),
            pulse_level: v.n > 10 ? 3 : v.n > 5 ? 2 : 1,
            updated_at: new Date().toISOString(),
        }, { merge: true });
    });
    await batch.commit();
});
/** Emergency ghost — instant hide from all maps. */
export const emergencyGhostMode = onCall(async (request) => {
    const uid = requireAuth(request);
    await db.collection('user_live_locations').doc(uid).set({
        sharing_enabled: false,
        is_ghost: true,
        updated_at: new Date().toISOString(),
    }, { merge: true });
    return { ok: true };
});
/** AI area intelligence — safety, trespassing, access rules (Gemini + Google Search). */
export const researchMapLocation = onCall({ secrets: [...INTEL_SECRETS], region: 'us-central1' }, async (request) => {
    const uid = requireAuth(request);
    enforceRateLimit(await rateLimit(`map_intel:${uid}`, 12, 3600));
    const { latitude, longitude, placeName, placeId, forceRefresh } = (request.data || {});
    if (latitude == null || longitude == null) {
        throw new HttpsError('invalid-argument', 'latitude & longitude required');
    }
    const intel = await getOrResearchLocationIntel({
        lat: latitude,
        lng: longitude,
        placeName,
        placeId,
        forceRefresh: !!forceRefresh,
    });
    return { intel };
});
async function fetchFriendIdsForProfile(profileId) {
    const [sent, recv] = await Promise.all([
        db.collection('friend_requests').where('sender_id', '==', profileId).where('status', '==', 'accepted').limit(80).get(),
        db.collection('friend_requests').where('receiver_id', '==', profileId).where('status', '==', 'accepted').limit(80).get(),
    ]);
    const ids = new Set();
    sent.docs.forEach((d) => {
        const rid = d.data().receiver_id;
        if (rid)
            ids.add(rid);
    });
    recv.docs.forEach((d) => {
        const sid = d.data().sender_id;
        if (sid)
            ids.add(sid);
    });
    return Array.from(ids);
}
/** Notify friends when someone starts a meetup on VybeMap. */
export const onMapMeetupCreated = onDocumentCreated({ document: 'map_meetups/{meetupId}', region: 'us-central1' }, async (event) => {
    const snap = event.data;
    if (!snap)
        return;
    const meetup = snap.data();
    const hostId = meetup.host_id;
    if (!hostId)
        return;
    const hostSnap = await db.collection('profiles').doc(hostId).get();
    const host = hostSnap.data() || {};
    const hostName = host.display_name || host.username || 'A friend';
    const meetupTitle = meetup.title || meetup.dest_label || 'a meetup';
    const friendIds = (await fetchFriendIdsForProfile(hostId)).slice(0, 40);
    if (!friendIds.length)
        return;
    const batch = db.batch();
    const now = new Date().toISOString();
    for (const friendId of friendIds) {
        const ref = db.collection('notifications').doc();
        batch.set(ref, {
            user_id: friendId,
            actor_id: hostId,
            type: 'map_meetup',
            title: hostName,
            body: `started a meetup: ${meetupTitle}`,
            deep_link: '/map',
            meetup_id: snap.id,
            read: false,
            created_at: now,
        });
    }
    await batch.commit();
});
//# sourceMappingURL=vybemap.js.map