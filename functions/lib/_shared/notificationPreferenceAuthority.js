import { createHash, randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, validAudienceId } from './profileAudienceAuthority.js';
export const notificationBooleanKeys = ['likes_enabled', 'comments_enabled', 'follows_enabled', 'mentions_enabled', 'dms_enabled', 'calls_enabled', 'friend_requests_enabled', 'streaks_enabled', 'stories_enabled', 'show_message_preview', 'marketplace_enabled', 'events_enabled', 'system_enabled', 'announcements_enabled', 'nearby_enabled', 'brief_pings_enabled', 'friend_activity_enabled', 'trending_local_enabled'];
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const badState = () => new HttpsError('failed-precondition', 'Notification settings could not be read safely. Please retry or contact support.');
const defaults = () => ({ ...Object.fromEntries(notificationBooleanKeys.map(key => [key, true])), quiet_hours_start: null, quiet_hours_end: null, smart_ping_radius_miles: 5, smart_ping_max_per_day: 6, brief_muted_until: null });
function normalized(rows, strict = false) {
    const value = defaults();
    for (const key of notificationBooleanKeys) {
        const present = rows.filter(row => row[key] !== undefined).map(row => row[key]);
        if (strict && (present.length !== 1 || typeof present[0] !== 'boolean'))
            throw badState();
        // Old duplicate rows must never turn a previous opt-out back on. Invalid
        // legacy booleans also suppress delivery until the user explicitly saves.
        if (present.some(item => item !== true))
            value[key] = false;
    }
    for (const key of ['quiet_hours_start', 'quiet_hours_end']) {
        const present = rows.map(row => row[key]).filter(item => item !== undefined);
        if (present.some(item => item !== null && (typeof item !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item))))
            throw badState();
        const distinct = [...new Set(present.filter(item => item !== null))];
        if (distinct.length > 1 || (strict && present.length !== 1))
            throw badState();
        value[key] = distinct[0] || null;
    }
    for (const [key, maximum] of [['smart_ping_radius_miles', 100], ['smart_ping_max_per_day', 24]]) {
        const present = rows.map(row => row[key]).filter(item => item !== undefined);
        if (present.some(item => typeof item !== 'number' || !Number.isInteger(item) || item < 0 || item > maximum) || (strict && present.length !== 1))
            throw badState();
        if (present.length)
            value[key] = Math.min(...present);
    }
    // Only the protected canonical row can authorize a timed mute. Older rows
    // predate this field; browser-written legacy timestamps are not adopted.
    if (strict && rows[0].brief_muted_until != null) {
        const expiry = rows[0].brief_muted_until;
        if (!Number.isSafeInteger(expiry) || Number(expiry) < 0)
            throw badState();
        value.brief_muted_until = Number(expiry);
    }
    return value;
}
async function stateFor(db, tx, identity) {
    const canonical = await tx.get(db.doc(`_notification_preferences/${identity.uid}`));
    if (canonical.exists) {
        const row = canonical.data();
        if (row.version !== 1 || row.owner_uid !== identity.uid || row.profile_id !== identity.profileId || typeof row.revision !== 'string' || !/^[a-f0-9]{64}$/.test(row.revision) || !object(row.values))
            throw badState();
        return { revision: row.revision, values: normalized([row.values], true), legacy: false };
    }
    const legacy = await tx.get(db.collection('notification_preferences').where('user_id', 'in', identity.aliases).limit(101));
    if (legacy.size > 100)
        throw badState();
    const values = normalized(legacy.docs.map(doc => doc.data()));
    return { revision: hash([identity.uid, identity.profileId, values]), values, legacy: !legacy.empty };
}
/** Shared by settings and delivery. No exception is converted into opt-in. */
export async function readDeliveryNotificationContext(db, profileId) {
    return db.runTransaction(async (tx) => {
        const identity = await resolveIdentity(db, tx, profileId);
        if (!identity)
            throw badState();
        return { ownerUid: identity.uid, profileId: identity.profileId, preferences: (await stateFor(db, tx, identity)).values };
    });
}
export async function readDeliveryNotificationPreferences(db, profileId) {
    return (await readDeliveryNotificationContext(db, profileId)).preferences;
}
export async function manageNotificationPreferencesFor(db, uid, raw) {
    if (!object(raw) || raw.expectedOwnerUid !== uid || !validAudienceId(raw.expectedProfileId))
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen notification settings.');
    const allowed = ['action', 'expectedOwnerUid', 'expectedProfileId', ...(raw.action === 'set' ? ['key', 'value', 'revision', 'requestId'] : raw.action === 'muteBrief' ? ['hours', 'revision', 'requestId'] : [])];
    if (!['read', 'set', 'muteBrief'].includes(String(raw.action)) || Object.keys(raw).some(key => !allowed.includes(key)))
        throw new HttpsError('invalid-argument', 'Invalid notification settings request.');
    if (raw.action === 'set' && (!notificationBooleanKeys.includes(raw.key) || typeof raw.value !== 'boolean' || typeof raw.revision !== 'string' || !/^[a-f0-9]{64}$/.test(raw.revision) || typeof raw.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(raw.requestId)))
        throw new HttpsError('invalid-argument', 'Invalid notification preference.');
    if (raw.action === 'muteBrief' && (raw.hours !== 1 || typeof raw.revision !== 'string' || !/^[a-f0-9]{64}$/.test(raw.revision) || typeof raw.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(raw.requestId)))
        throw new HttpsError('invalid-argument', 'Invalid one-hour mute request.');
    const muteUntil = Date.now() + 3600000;
    return db.runTransaction(async (tx) => {
        const identity = await resolveIdentity(db, tx, uid);
        if (!identity || identity.uid !== uid || identity.profileId !== raw.expectedProfileId)
            throw new HttpsError('failed-precondition', 'Your profile changed. Reopen notification settings.');
        let state = await stateFor(db, tx, identity);
        const receipt = () => ({ ok: true, ownerUid: uid, profileId: identity.profileId, revision: state.revision, values: state.values, legacy: state.legacy });
        if (raw.action === 'read')
            return receipt();
        const requestRef = db.doc(`_notification_preference_requests/${hash([uid, raw.requestId])}`);
        const existing = await tx.get(requestRef);
        const fingerprint = hash(raw.action === 'muteBrief' ? [uid, identity.profileId, 'muteBrief', 1, raw.revision] : [uid, identity.profileId, raw.key, raw.value, raw.revision]);
        if (existing.exists) {
            if (existing.data()?.fingerprint !== fingerprint)
                throw new HttpsError('already-exists', 'This settings request was already used. Refresh and retry.');
            // An old acknowledgement is never permission to overwrite a newer choice.
            return { ...receipt(), replay: true };
        }
        if (state.revision !== raw.revision)
            throw new HttpsError('aborted', 'Settings changed on another device. Refresh before trying again.');
        state = { revision: randomBytes(32).toString('hex'), values: raw.action === 'muteBrief' ? { ...state.values, brief_muted_until: muteUntil } : { ...state.values, [raw.key]: raw.value }, legacy: false };
        tx.set(db.doc(`_notification_preferences/${uid}`), { version: 1, owner_uid: uid, profile_id: identity.profileId, revision: state.revision, values: state.values, updated_at: new Date().toISOString() });
        tx.create(requestRef, { owner_uid: uid, fingerprint, revision: state.revision, created_at: new Date().toISOString(), expireAt: Timestamp.fromMillis(Date.now() + 7 * 86400000) });
        return { ...receipt(), replay: false };
    });
}
//# sourceMappingURL=notificationPreferenceAuthority.js.map