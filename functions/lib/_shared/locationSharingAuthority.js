import { createHash, randomBytes } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { closeFriendAuthorityId, hasCloseFriendAuthority, normalizedProfileSettings, resolveIdentity, validAudienceId } from './profileAudienceAuthority.js';
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const revision = () => randomBytes(24).toString('hex');
const validRevision = (value) => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value);
const validId = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = (value) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const iso = (value) => new Date(value).toISOString();
const stale = () => new HttpsError('aborted', 'Location sharing changed. Refresh before trying again.');
const invalid = () => new HttpsError('invalid-argument', 'Invalid location sharing details.');
export const locationGrantId = (sharerUid, viewerUid) => hash(['location-grant', sharerUid, viewerUid]);
const pairId = (a, b) => hash(['location-pair', ...[a, b].sort()]);
const durations = ['once', '1h', 'until_tonight', '24h', 'indefinite', 'while_using', 'custom'];
const activities = ['stationary', 'walking', 'running', 'driving', 'cycling', 'flying', 'traveling'];
const actions = ['read', 'request', 'respond', 'pause', 'stop', 'setSharing', 'publishPosition'];
export function normalizeLocationInput(raw, uid) {
    if (!object(raw))
        throw invalid();
    if (raw.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen location sharing.');
    if (!validAudienceId(raw.expectedProfileId) || !actions.includes(raw.action))
        throw invalid();
    const keys = {
        read: ['targetId'], request: ['targetId', 'duration', 'precision', 'message', 'customMinutes'],
        respond: ['locationRequestId', 'expectedRevision', 'intent'], pause: ['shareId', 'expectedRevision', 'paused'], stop: ['shareId', 'expectedRevision'],
        setSharing: ['expectedRevision', 'enabled'], publishPosition: ['sharingRevision', 'sampledAt', 'latitude', 'longitude', 'accuracy', 'speed', 'heading', 'batteryPercent', 'activityType'],
    };
    const action = raw.action;
    if (Object.keys(raw).some(key => !['expectedOwnerUid', 'expectedProfileId', 'action', ...(action === 'read' ? [] : ['requestId']), ...keys[action]].includes(key)))
        throw invalid();
    if (action !== 'read' && !uuid(raw.requestId))
        throw invalid();
    if (action === 'read' && raw.targetId !== undefined && !validAudienceId(raw.targetId))
        throw invalid();
    if (action === 'request' && (!validAudienceId(raw.targetId) || !durations.includes(raw.duration)
        || !['approximate', 'precise'].includes(raw.precision) || (raw.message !== null && (typeof raw.message !== 'string' || raw.message.length > 200
        || [...raw.message].some(char => char.charCodeAt(0) < 32 && char !== '\n' && char !== '\t')))
        || (raw.duration === 'custom' ? !Number.isInteger(raw.customMinutes) || !finite(raw.customMinutes, 5, 1440) : raw.customMinutes !== undefined)))
        throw invalid();
    if (action === 'respond' && (!validId(raw.locationRequestId) || !validRevision(raw.expectedRevision) || !['accept', 'decline', 'block'].includes(raw.intent)))
        throw invalid();
    if (['pause', 'stop'].includes(action) && (!validId(raw.shareId) || !validRevision(raw.expectedRevision) || (action === 'pause' && typeof raw.paused !== 'boolean')))
        throw invalid();
    if (action === 'setSharing' && ((raw.expectedRevision !== null && !validRevision(raw.expectedRevision)) || typeof raw.enabled !== 'boolean'))
        throw invalid();
    if (action === 'publishPosition' && (!validRevision(raw.sharingRevision) || !Number.isSafeInteger(raw.sampledAt)
        || !finite(raw.latitude, -90, 90) || !finite(raw.longitude, -180, 180)
        || (raw.accuracy !== null && !finite(raw.accuracy, 0, 100000)) || (raw.speed !== null && !finite(raw.speed, 0, 500))
        || (raw.heading !== null && !finite(raw.heading, 0, 360)) || (raw.batteryPercent !== null && (!Number.isInteger(raw.batteryPercent) || !finite(raw.batteryPercent, 0, 100)))
        || !activities.includes(raw.activityType)))
        throw invalid();
    return raw;
}
function publicProfile(owner) {
    const url = owner.row.avatar_url;
    return { id: owner.profileId, username: typeof owner.row.username === 'string' ? owner.row.username.slice(0, 100) : 'friend',
        displayName: typeof owner.row.display_name === 'string' ? owner.row.display_name.slice(0, 200) : null,
        avatarUrl: typeof url === 'string' && /^https:\/\//.test(url) && url.length <= 8192 ? url : null };
}
function stateProjection(row, actor) {
    if (!row)
        return { revision: null, enabled: false, updatedAt: null };
    if (row.version !== 1 || row.owner_uid !== actor.uid || row.profile_id !== actor.profileId || !validRevision(row.revision) || typeof row.enabled !== 'boolean'
        || !finite(row.updated_at_ms, 0, Number.MAX_SAFE_INTEGER))
        throw new HttpsError('failed-precondition', 'Location settings need repair. Sharing is unavailable.');
    return { revision: row.revision, enabled: row.enabled, updatedAt: iso(row.updated_at_ms) };
}
async function pairAllowed(db, tx, a, b) {
    if (a.uid === b.uid)
        return false;
    const [out, incoming, block, reverse] = await Promise.all([
        tx.get(db.collection('friend_requests').where('sender_id', 'in', a.aliases).where('receiver_id', 'in', b.aliases).where('status', '==', 'accepted').limit(1)),
        tx.get(db.collection('friend_requests').where('sender_id', 'in', b.aliases).where('receiver_id', 'in', a.aliases).where('status', '==', 'accepted').limit(1)),
        tx.get(db.collection('blocked_users').where('blocker_id', 'in', a.aliases).where('blocked_id', 'in', b.aliases).limit(1)),
        tx.get(db.collection('blocked_users').where('blocker_id', 'in', b.aliases).where('blocked_id', 'in', a.aliases).limit(1)),
    ]);
    return (!out.empty || !incoming.empty) && block.empty && reverse.empty;
}
const boundShare = (row, id, sharer, viewer) => !!row && row.version === 1 && row.id === id
    && id === locationGrantId(sharer.uid, viewer.uid) && row.sharer_uid === sharer.uid && row.viewer_uid === viewer.uid
    && row.sharer_id === sharer.profileId && row.viewer_id === viewer.profileId && validRevision(row.revision)
    && typeof row.active === 'boolean' && typeof row.paused === 'boolean' && ['approximate', 'precise'].includes(row.precision)
    && durations.includes(row.duration) && finite(row.expires_at_ms, 0, Number.MAX_SAFE_INTEGER)
    && finite(row.created_at_ms, 0, Number.MAX_SAFE_INTEGER) && finite(row.updated_at_ms, 0, Number.MAX_SAFE_INTEGER);
function shareProjection(row, now, allowed = true) {
    return { id: row.id, revision: row.revision, sharerId: row.sharer_id, viewerId: row.viewer_id,
        precision: row.precision, duration: row.duration, active: row.active === true && row.expires_at_ms > now && allowed,
        paused: row.paused, expiresAt: iso(row.expires_at_ms), createdAt: iso(row.created_at_ms), updatedAt: iso(row.updated_at_ms) };
}
function requestProjection(row, requester, target, now) {
    return { id: row.id, revision: row.revision, requesterId: requester.profileId, targetId: target.profileId,
        requester: publicProfile(requester), target: publicProfile(target), precision: row.precision, duration: row.duration,
        customMinutes: row.custom_minutes, message: row.message, status: row.status === 'pending' && row.expires_at_ms <= now ? 'expired' : row.status,
        expiresAt: iso(row.expires_at_ms), createdAt: iso(row.created_at_ms), updatedAt: iso(row.updated_at_ms), shareId: row.share_id };
}
function expiry(duration, minutes, now) {
    if (duration === 'until_tonight') {
        const date = new Date(now);
        date.setUTCHours(23, 59, 59, 999);
        return date.getTime() > now ? date.getTime() : date.getTime() + 86400000;
    }
    return now + ({ once: 900000, '1h': 3600000, '24h': 86400000, indefinite: 31536000000, while_using: 14400000, custom: Number(minutes) * 60000 }[duration] ?? 0);
}
async function projectLocation(db, tx, grant, sharer, viewer, now) {
    if (grant.active !== true || grant.paused !== false || Number(grant.expires_at_ms) <= now)
        return null;
    const [state, snapshot, privacy, close] = await Promise.all([tx.get(db.collection('_location_state').doc(sharer.uid)), tx.get(db.collection('user_live_locations').doc(sharer.profileId)),
        tx.get(db.collection('profile_visibility').doc(sharer.profileId)), tx.get(db.collection('_close_friend_authority').doc(closeFriendAuthorityId(sharer.uid, viewer.uid)))]);
    const settings = normalizedProfileSettings(privacy.data(), sharer.profileId), level = settings.location;
    if (!['public', 'everyone', 'friends'].includes(level) && !(level === 'close_friends' && hasCloseFriendAuthority(close.data(), sharer, viewer)))
        return null;
    const current = stateProjection(state.data(), sharer), live = snapshot.data();
    if (!current.enabled || !live || live.version !== 1 || live.owner_uid !== sharer.uid || live.user_id !== sharer.profileId || live.sharing_revision !== current.revision
        || !finite(live.latitude, -90, 90) || !finite(live.longitude, -180, 180) || !finite(live.expires_at_ms, now + 1, now + 125000)
        || !finite(live.sampled_at_ms, now - 120000, now + 5000) || live.sharing_enabled !== true || live.is_ghost !== false)
        return null;
    const projectedExpiry = Math.min(live.expires_at_ms, grant.expires_at_ms, grant.duration === 'while_using' ? live.sampled_at_ms + 30000 : Number.POSITIVE_INFINITY);
    if (projectedExpiry <= now)
        return null;
    const precise = grant.precision === 'precise';
    const coarse = (value, max) => Number(Math.max(-max + 0.01, Math.min(max - 0.01, Math.floor(value / 0.02) * 0.02 + 0.01)).toFixed(2));
    return { id: sharer.profileId, shareId: grant.id, latitude: precise ? live.latitude : coarse(live.latitude, 90), longitude: precise ? live.longitude : coarse(live.longitude, 180),
        accuracy: precise ? live.accuracy : 2000, speed: precise ? live.speed : null, heading: precise ? live.heading : null,
        batteryPercent: live.battery_percent, activityType: live.activity_type, precision: grant.precision, approxRadiusM: precise ? 0 : 2000,
        updatedAt: iso(live.sampled_at_ms), expiresAt: iso(projectedExpiry), profile: publicProfile(sharer) };
}
export async function runLocationSharing(db, uid, raw, now = Date.now()) {
    const input = normalizeLocationInput(raw, uid), newRevision = revision(), fingerprint = hash(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)));
    return db.runTransaction(async (tx) => {
        const actor = await resolveIdentity(db, tx, uid);
        if (!actor || actor.uid !== uid || actor.profileId !== input.expectedProfileId)
            throw new HttpsError('failed-precondition', 'Your profile changed. Reopen location sharing.');
        const stateRef = db.collection('_location_state').doc(uid), stateRow = (await tx.get(stateRef)).data(), state = stateProjection(stateRow, actor);
        const base = { ok: true, ownerUid: uid, profileId: actor.profileId, action: input.action, requestId: input.requestId ?? null, serverTime: now };
        const identities = new Map([[uid, Promise.resolve(actor)]]);
        const identity = (value) => {
            if (!validAudienceId(value))
                return Promise.resolve(null);
            if (!identities.has(value))
                identities.set(value, resolveIdentity(db, tx, value));
            return identities.get(value);
        };
        if (input.action === 'read') {
            const target = input.targetId === undefined ? null : await identity(input.targetId);
            if (input.targetId !== undefined && (!target || target.profileId !== input.targetId || target.uid === uid))
                throw new HttpsError('failed-precondition', 'This friend profile changed. Reopen it.');
            const grantQuery = target ? tx.getAll(...[locationGrantId(uid, target.uid), locationGrantId(target.uid, uid)].map(id => db.collection('_location_grants').doc(id)))
                .then(docs => ({ docs: docs.filter(doc => doc.exists), size: docs.filter(doc => doc.exists).length, empty: docs.every(doc => !doc.exists) }))
                : tx.get(db.collection('_location_grants').where('participant_uids', 'array-contains', uid).where('active', '==', true).where('expires_at_ms', '>', now).limit(101));
            const requestQuery = target ? db.collection('_location_requests').where('pair_id', '==', pairId(uid, target.uid))
                : db.collection('_location_requests').where('participant_uids', 'array-contains', uid);
            const [grantDocs, requestDocs, legacyLive, legacyShares, legacyViewedShares] = await Promise.all([
                grantQuery,
                tx.get(requestQuery.where('status', '==', 'pending').where('expires_at_ms', '>', now).limit(101)),
                tx.get(db.collection('user_live_locations').doc(actor.profileId)),
                tx.get(db.collection('location_shares').where('sharer_id', 'in', actor.aliases).limit(1)),
                tx.get(db.collection('location_shares').where('viewer_id', 'in', actor.aliases).limit(1)),
            ]);
            if (grantDocs.size > 100 || requestDocs.size > 100)
                throw new HttpsError('resource-exhausted', 'Too many location shares to load. Manage a friend at a time.');
            const shares = [], requests = [], locations = [];
            for (const doc of grantDocs.docs) {
                const row = doc.data();
                if (!row || (target && row.sharer_uid !== target.uid && row.viewer_uid !== target.uid))
                    continue;
                const [sharer, viewer] = await Promise.all([identity(row.sharer_uid), identity(row.viewer_uid)]);
                if (!sharer || !viewer || !boundShare(row, doc.id, sharer, viewer) || ![sharer.uid, viewer.uid].includes(uid))
                    continue;
                const allowed = await pairAllowed(db, tx, sharer, viewer);
                shares.push(shareProjection(row, now, allowed));
                if (viewer.uid === uid && allowed) {
                    const projected = await projectLocation(db, tx, row, sharer, viewer, now);
                    if (projected)
                        locations.push(projected);
                }
            }
            for (const doc of requestDocs.docs) {
                const row = doc.data();
                if (target && row.requester_uid !== target.uid && row.target_uid !== target.uid)
                    continue;
                const [requester, receiver] = await Promise.all([identity(row.requester_uid), identity(row.target_uid)]);
                if (!requester || !receiver || row.version !== 1 || row.id !== doc.id || !validRevision(row.revision)
                    || row.requester_id !== requester.profileId || row.target_id !== receiver.profileId || ![requester.uid, receiver.uid].includes(uid))
                    continue;
                if (!await pairAllowed(db, tx, requester, receiver))
                    continue;
                requests.push(requestProjection(row, requester, receiver, now));
            }
            return { ...base, targetId: input.targetId ?? null, state, shares, requests, locations, leaseUntil: now + 15000,
                legacySharingNeedsReview: !stateRow && grantDocs.empty && (legacyLive.exists || !legacyShares.empty || !legacyViewedShares.empty) };
        }
        if (input.action === 'publishPosition') {
            if (!state.enabled || input.sharingRevision !== state.revision)
                throw stale();
            const liveRef = db.collection('user_live_locations').doc(actor.profileId), live = (await tx.get(liveRef)).data();
            if (!finite(input.sampledAt, now - 60000, now + 5000))
                throw new HttpsError('failed-precondition', 'This location sample expired. Wait for a fresh location.');
            if (live?.last_request_id === input.requestId && live?.sharing_revision === state.revision) {
                if (live.fingerprint !== fingerprint || Number(live.expires_at_ms) <= now)
                    throw stale();
                return { ...base, sharingRevision: state.revision, sampledAt: input.sampledAt, expiresAt: iso(live.expires_at_ms) };
            }
            if (live?.sharing_revision === state.revision && Number(live.sampled_at_ms) >= Number(input.sampledAt))
                throw stale();
            const expires = Math.min(now + 120000, Number(input.sampledAt) + 120000);
            tx.set(liveRef, { version: 1, owner_uid: uid, user_id: actor.profileId, sharing_revision: state.revision, last_request_id: input.requestId, fingerprint,
                latitude: input.latitude, longitude: input.longitude, accuracy: input.accuracy, speed: input.speed, heading: input.heading, battery_percent: input.batteryPercent,
                activity_type: input.activityType, sampled_at_ms: input.sampledAt, expires_at_ms: expires, sharing_enabled: true, is_ghost: false, updated_at: iso(now), expires_at: iso(expires) });
            return { ...base, sharingRevision: state.revision, sampledAt: input.sampledAt, expiresAt: iso(expires) };
        }
        const receiptRef = db.collection('_location_receipts').doc(hash([uid, input.requestId])), prior = (await tx.get(receiptRef)).data();
        if (prior) {
            if (prior.owner_uid !== uid || prior.profile_id !== actor.profileId || prior.fingerprint !== fingerprint)
                throw new HttpsError('already-exists', 'This retry belongs to different location settings.');
            for (const dependency of prior.dependencies)
                if ((await tx.get(db.doc(dependency.path))).data()?.revision !== dependency.revision)
                    throw stale();
            if (prior.positive_peer) {
                const other = await identity(prior.positive_peer);
                if (!other || !await pairAllowed(db, tx, actor, other))
                    throw stale();
            }
            if (typeof prior.valid_until_ms === 'number' && prior.valid_until_ms <= now)
                throw stale();
            return prior.receipt;
        }
        const writes = [], dependencies = [];
        let receipt, positivePeer = null, validUntil = null;
        if (input.action === 'setSharing') {
            if (input.expectedRevision !== state.revision)
                throw stale();
            const next = { version: 1, owner_uid: uid, profile_id: actor.profileId, enabled: input.enabled, revision: newRevision, updated_at_ms: now };
            writes.push(() => tx.set(stateRef, next), () => tx.delete(db.collection('user_live_locations').doc(actor.profileId)));
            dependencies.push({ path: stateRef.path, revision: newRevision });
            receipt = { ...base, state: stateProjection(next, actor) };
        }
        else if (input.action === 'request') {
            const target = await identity(input.targetId);
            if (!target || target.profileId !== input.targetId || !await pairAllowed(db, tx, actor, target))
                throw new HttpsError('permission-denied', 'Location requests are available only between current unblocked friends.');
            const id = hash(['location-request', uid, target.uid]), ref = db.collection('_location_requests').doc(id), existing = (await tx.get(ref)).data();
            if (existing?.status === 'pending' && Number(existing.expires_at_ms) > now)
                throw new HttpsError('already-exists', 'This friend already has a pending location request.');
            const previousGrant = (await tx.get(db.collection('_location_grants').doc(locationGrantId(target.uid, uid)))).data();
            const next = { version: 1, id, revision: newRevision, requester_uid: uid, requester_id: actor.profileId, target_uid: target.uid, target_id: target.profileId,
                participant_uids: [uid, target.uid], pair_id: pairId(uid, target.uid), duration: input.duration, precision: input.precision, message: input.message, custom_minutes: input.customMinutes ?? null,
                status: 'pending', expires_at_ms: now + 86400000, created_at_ms: now, updated_at_ms: now, share_id: null, expected_share_revision: previousGrant?.revision ?? null };
            writes.push(() => tx.set(ref, next));
            dependencies.push({ path: ref.path, revision: newRevision });
            positivePeer = target.uid;
            validUntil = next.expires_at_ms;
            receipt = { ...base, request: requestProjection(next, actor, target, now) };
        }
        else if (input.action === 'respond') {
            const ref = db.collection('_location_requests').doc(input.locationRequestId), row = (await tx.get(ref)).data();
            const requester = await identity(row?.requester_uid);
            if (!row || row.version !== 1 || !requester || row.target_uid !== uid || row.target_id !== actor.profileId || row.requester_id !== requester.profileId)
                throw new HttpsError('permission-denied', 'This location request is unavailable.');
            if (row.revision !== input.expectedRevision || row.status !== 'pending' || Number(row.expires_at_ms) <= now)
                throw stale();
            let share = null;
            const next = { ...row, status: input.intent === 'accept' ? 'accepted' : input.intent === 'block' ? 'blocked' : 'declined', revision: newRevision, updated_at_ms: now };
            if (input.intent === 'accept') {
                if (!await pairAllowed(db, tx, actor, requester))
                    throw new HttpsError('permission-denied', 'This friend can no longer receive your location.');
                const id = locationGrantId(uid, requester.uid), grantRef = db.collection('_location_grants').doc(id);
                const previousGrant = (await tx.get(grantRef)).data();
                if ((previousGrant?.revision ?? null) !== row.expected_share_revision)
                    throw stale();
                const grant = { version: 1, id, revision: newRevision, sharer_uid: uid, viewer_uid: requester.uid, sharer_id: actor.profileId, viewer_id: requester.profileId,
                    participant_uids: [uid, requester.uid], duration: row.duration, precision: row.precision, active: true, paused: false,
                    expires_at_ms: expiry(row.duration, row.custom_minutes, now), created_at_ms: now, updated_at_ms: now };
                next.share_id = id;
                writes.push(() => tx.set(grantRef, grant));
                dependencies.push({ path: grantRef.path, revision: newRevision });
                positivePeer = requester.uid;
                validUntil = grant.expires_at_ms;
                share = shareProjection(grant, now);
            }
            else if (input.intent === 'block') {
                for (const id of [locationGrantId(uid, requester.uid), locationGrantId(requester.uid, uid)]) {
                    const grantRef = db.collection('_location_grants').doc(id);
                    if ((await tx.get(grantRef)).exists)
                        writes.push(() => tx.update(grantRef, { active: false, paused: false, revision: newRevision, updated_at_ms: now }));
                }
                writes.push(() => tx.set(db.collection('blocked_users').doc(hash(['location-block', uid, requester.uid])), { blocker_id: actor.profileId, blocked_id: requester.profileId, created_at: iso(now) }));
            }
            writes.push(() => tx.update(ref, next));
            dependencies.push({ path: ref.path, revision: newRevision });
            receipt = { ...base, request: requestProjection(next, requester, actor, now), share };
        }
        else {
            const ref = db.collection('_location_grants').doc(input.shareId), row = (await tx.get(ref)).data();
            const [sharer, viewer] = await Promise.all([identity(row?.sharer_uid), identity(row?.viewer_uid)]);
            if (!sharer || !viewer || !boundShare(row, input.shareId, sharer, viewer) || ![sharer.uid, viewer.uid].includes(uid)
                || (input.action === 'pause' && sharer.uid !== uid))
                throw new HttpsError('permission-denied', 'This location share is unavailable.');
            if (row.revision !== input.expectedRevision)
                throw stale();
            if (input.action === 'pause' && input.paused === false) {
                if (row.active !== true || Number(row.expires_at_ms) <= now || !await pairAllowed(db, tx, sharer, viewer))
                    throw stale();
                positivePeer = viewer.uid;
                validUntil = row.expires_at_ms;
            }
            const next = { ...row, revision: newRevision, updated_at_ms: now, ...(input.action === 'stop' ? { active: false, paused: false } : { paused: input.paused }) };
            writes.push(() => tx.set(ref, next));
            dependencies.push({ path: ref.path, revision: newRevision });
            receipt = { ...base, share: shareProjection(next, now) };
        }
        for (const write of writes)
            write();
        tx.create(receiptRef, { owner_uid: uid, profile_id: actor.profileId, fingerprint, dependencies, positive_peer: positivePeer, valid_until_ms: validUntil, receipt, created_at_ms: now });
        return receipt;
    });
}
//# sourceMappingURL=locationSharingAuthority.js.map