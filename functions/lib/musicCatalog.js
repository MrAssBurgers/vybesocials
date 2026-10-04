import { FieldPath } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { resolveIdentity } from './_shared/profileAudienceAuthority.js';
const APP_SOUNDS = new Set(['dm-received', 'dm-sent', 'post-liked', 'share-post', 'comment', 'call-ring', 'vybe-notification'].map(name => `/sounds/${name}.wav`));
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const id = (value) => text(value, 128) && !value.includes('/');
function httpsUrl(value) {
    if (!text(value, 2048))
        return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password
            && /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(url.hostname)
            && !/(^|\.)(localhost|local|internal|lan|home|invalid|test)$/.test(url.hostname);
    }
    catch {
        return false;
    }
}
/** Operator approval is required; the service does not infer music rights. */
export function approvedMusicPreview(documentId, row, now = Date.now()) {
    if (row.is_active !== true || row.preview_approved !== true || row.license_status !== 'approved' || !text(row.license_reference, 500))
        return null;
    if (row.license_expires_at !== undefined && row.license_expires_at !== null) {
        const expiry = typeof row.license_expires_at === 'string' ? Date.parse(row.license_expires_at) : NaN;
        if (!Number.isFinite(expiry) || expiry <= now)
            return null;
    }
    if (!id(documentId) || !text(row.title, 160) || !text(row.artist, 160) || !text(row.genre, 60)
        || typeof row.duration !== 'number' || !Number.isFinite(row.duration) || row.duration <= 0 || row.duration > 86400)
        return null;
    const localSound = typeof row.preview_url === 'string' && APP_SOUNDS.has(row.preview_url);
    if (!(localSound && row.asset_kind === 'app_sound_effect') && !httpsUrl(row.preview_url))
        return null;
    const previewSeconds = row.preview_seconds === undefined ? 30 : row.preview_seconds;
    if (typeof previewSeconds !== 'number' || !Number.isFinite(previewSeconds) || previewSeconds <= 0 || previewSeconds > 30)
        return null;
    return {
        track_id: documentId, title: row.title.trim(), artist: row.artist.trim(), genre: row.genre.trim(),
        duration: row.duration, preview_url: row.preview_url, preview_seconds: Math.min(previewSeconds, row.duration),
        artwork_url: httpsUrl(row.artwork_url) ? row.artwork_url : null,
        asset_kind: localSound ? 'app_sound_effect' : 'music_preview',
    };
}
export async function runReadMusicCatalog(database, uid, raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new HttpsError('invalid-argument', 'Catalog request required.');
    const input = raw;
    if (input.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen music.');
    if (!id(input.expectedProfileId) || (input.cursor !== undefined && !id(input.cursor))
        || Object.keys(input).some(key => !['expectedOwnerUid', 'expectedProfileId', 'cursor'].includes(key)))
        throw new HttpsError('invalid-argument', 'Invalid catalog request.');
    return database.runTransaction(async (tx) => {
        const actor = await resolveIdentity(database, tx, uid);
        if (!actor || actor.uid !== uid || actor.profileId !== input.expectedProfileId)
            throw new HttpsError('failed-precondition', 'Your profile could not be verified.');
        let query = database.collection('licensed_tracks').orderBy(FieldPath.documentId()).limit(25);
        if (input.cursor)
            query = query.startAfter(input.cursor);
        const snapshot = await tx.get(query);
        const tracks = snapshot.docs.map(doc => approvedMusicPreview(doc.id, doc.data())).filter(row => row !== null);
        return { ownerUid: uid, profileId: actor.profileId, tracks, unavailableCount: snapshot.size - tracks.length,
            nextCursor: snapshot.size === 25 ? snapshot.docs[snapshot.size - 1].id : null };
    });
}
export const readMusicCatalog = onCall({ region: 'us-central1', cpu: 0.083, concurrency: 1, maxInstances: 10 }, async (request) => {
    const uid = requireAuth(request);
    enforceRateLimit(await rateLimit(`music-catalog:${uid}`, 60, 60));
    return runReadMusicCatalog(db, uid, request.data);
});
//# sourceMappingURL=musicCatalog.js.map