/**
 * VybeMap Cloud Functions — location abuse detection, heatmap aggregation, meetup notifications.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, requireAuth } from './_shared/admin.js';
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
//# sourceMappingURL=vybemap.js.map