import { createHash } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { closeFriendAuthorityId, hasCloseFriendAuthority, normalizedProfileSettings, resolveIdentity, validAudienceId } from './profileAudienceAuthority.js';
import { locationGrantId } from './locationSharingAuthority.js';
const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value) => validAudienceId(value) && value !== '.' && value !== '..';
const rev = (value) => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value);
const hashId = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const mapWaveHash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const version = (value) => value ? `${value.seconds}:${value.nanoseconds}` : '';
const cooldownMs = 60000, leaseMs = 15000;
const unavailable = () => { throw new HttpsError('permission-denied', 'This friend is no longer available on your map. Refresh before waving.'); };
const changed = () => { throw new HttpsError('failed-precondition', 'Your verified account changed. Reopen the map.'); };
const stale = () => { throw new HttpsError('aborted', 'Map sharing changed. Refresh before trying again.'); };
function normalize(raw, uid) {
    if (!object(raw) || raw.expectedOwnerUid !== uid)
        return changed();
    if (raw.action !== 'send' || !id(raw.expectedProfileId) || !id(raw.targetProfileId) || !integer(raw.expectedAccountCreatedAt) || !rev(raw.expectedAccessRevision)
        || typeof raw.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(raw.requestId)
        || Object.keys(raw).some(key => !['action', 'expectedOwnerUid', 'expectedProfileId', 'expectedAccountCreatedAt', 'targetProfileId', 'expectedAccessRevision', 'requestId'].includes(key))) {
        throw new HttpsError('invalid-argument', 'These map wave details are invalid.');
    }
    return raw;
}
async function checkAuth(auth, actor) {
    let user;
    try {
        user = await auth.getUser(actor.uid);
    }
    catch (error) {
        if (error?.code === 'auth/user-not-found')
            return changed();
        throw new HttpsError('unavailable', 'Account ownership could not be checked. Retry shortly.');
    }
    if (user.disabled || user.uid !== actor.uid || Date.parse(user.metadata.creationTime) !== actor.created)
        changed();
}
async function identity(db, tx, auth, alias) {
    const actor = await resolveIdentity(db, tx, alias);
    if (!actor)
        return changed();
    const row = (await tx.get(db.doc(`_account_profile_bindings/${actor.uid}`))).data();
    if (row?.version !== 1 || row.status !== 'active' || row.owner_uid !== actor.uid || row.profile_id !== actor.profileId || !integer(row.auth_created_at_ms) || !rev(row.revision))
        changed();
    const result = { ...actor, created: row.auth_created_at_ms, binding: row.revision };
    await checkAuth(auth, result);
    return result;
}
/** Same directional consent and sample freshness as checked map projection; no coordinates leave this helper. */
async function access(db, tx, auth, input, now) {
    const [actor, target] = await Promise.all([identity(db, tx, auth, input.expectedOwnerUid), identity(db, tx, auth, input.targetProfileId)]);
    if (actor.uid !== input.expectedOwnerUid || actor.profileId !== input.expectedProfileId || actor.created !== input.expectedAccountCreatedAt)
        changed();
    if (target.profileId !== input.targetProfileId || target.uid === actor.uid)
        return unavailable();
    const grantId = locationGrantId(target.uid, actor.uid);
    const [out, incoming, block, reverse, grant, state, liveDoc, privacy, close] = await Promise.all([
        tx.get(db.collection('friend_requests').where('sender_id', 'in', actor.aliases).where('receiver_id', 'in', target.aliases).where('status', '==', 'accepted').limit(1)),
        tx.get(db.collection('friend_requests').where('sender_id', 'in', target.aliases).where('receiver_id', 'in', actor.aliases).where('status', '==', 'accepted').limit(1)),
        tx.get(db.collection('blocked_users').where('blocker_id', 'in', actor.aliases).where('blocked_id', 'in', target.aliases).limit(1)),
        tx.get(db.collection('blocked_users').where('blocker_id', 'in', target.aliases).where('blocked_id', 'in', actor.aliases).limit(1)),
        tx.get(db.doc(`_location_grants/${grantId}`)), tx.get(db.doc(`_location_state/${target.uid}`)), tx.get(db.doc(`user_live_locations/${target.profileId}`)),
        tx.get(db.doc(`profile_visibility/${target.profileId}`)), tx.get(db.doc(`_close_friend_authority/${closeFriendAuthorityId(target.uid, actor.uid)}`)),
    ]);
    if ((out.empty && incoming.empty) || !block.empty || !reverse.empty)
        return unavailable();
    const level = normalizedProfileSettings(privacy.data(), target.profileId).location;
    if (!['public', 'everyone', 'friends'].includes(level) && !(level === 'close_friends' && hasCloseFriendAuthority(close.data(), target, actor)))
        return unavailable();
    const g = grant.data(), s = state.data(), live = liveDoc.data();
    if (!g || g.version !== 1 || g.id !== grantId || g.sharer_uid !== target.uid || g.viewer_uid !== actor.uid || g.sharer_id !== target.profileId || g.viewer_id !== actor.profileId
        || !rev(g.revision) || !['approximate', 'precise'].includes(g.precision) || !['once', '1h', '24h', 'until_tonight', 'while_using', 'custom', 'indefinite'].includes(g.duration)
        || g.active !== true || g.paused !== false || !integer(g.created_at_ms) || g.created_at_ms < Math.max(actor.created, target.created)
        || !integer(g.updated_at_ms) || !integer(g.expires_at_ms) || g.expires_at_ms <= now)
        return unavailable();
    if (g.revision !== input.expectedAccessRevision)
        return stale();
    if (!s || s.version !== 1 || s.owner_uid !== target.uid || s.profile_id !== target.profileId || !rev(s.revision) || s.enabled !== true
        || !integer(s.updated_at_ms) || s.updated_at_ms < target.created || !live || live.version !== 1 || live.owner_uid !== target.uid || live.user_id !== target.profileId
        || live.sharing_revision !== s.revision || live.sharing_enabled !== true || live.is_ghost !== false
        || !finite(live.latitude, -90, 90) || !finite(live.longitude, -180, 180) || !finite(live.sampled_at_ms, Math.max(target.created, now - 120000), now + 5000)
        || !finite(live.expires_at_ms, now + 1, now + 125000))
        return unavailable();
    const expires = Math.min(g.expires_at_ms, live.expires_at_ms, g.duration === 'while_using' ? live.sampled_at_ms + 30000 : Infinity);
    if (expires <= now)
        return unavailable();
    return { actor, target, grant, state, expires };
}
const dependencies = (value) => [value.grant, value.state].map(doc => ({ path: doc.ref.path, createTime: version(doc.createTime), revision: doc.data().revision }));
function checkDependencies(row, value) {
    if (row.actor_binding_revision !== value.actor.binding || row.target_binding_revision !== value.target.binding || row.target_uid !== value.target.uid
        || row.target_account_created_at_ms !== value.target.created || mapWaveHash(row.dependencies) !== mapWaveHash(dependencies(value)))
        stale();
}
function actorName(actor) {
    for (const value of [actor.row.display_name, actor.row.username])
        if (typeof value === 'string' && value.trim() && value.trim().length <= 120 && ![...value].some(char => char.charCodeAt(0) < 32))
            return value.trim();
    return 'A friend';
}
function notificationFields(row) {
    return Object.fromEntries(['user_id', 'actor_id', 'type', 'title', 'body', 'deep_link', 'created_at', 'wave_receipt_id'].map(key => [key, row[key]]));
}
function checkedReceipt(row, input, fingerprint) {
    if (!row || row.version !== 1 || row.owner_uid !== input.expectedOwnerUid || row.profile_id !== input.expectedProfileId || row.account_created_at_ms !== input.expectedAccountCreatedAt
        || row.fingerprint !== fingerprint || row.request_id !== input.requestId || !id(row.target_profile_id) || row.target_profile_id !== input.targetProfileId
        || !integer(row.sent_at_ms) || row.cooldown_until_ms !== Number(row.sent_at_ms) + cooldownMs || !id(row.notification_id) || !hashId(row.notification_fingerprint)) {
        throw new HttpsError('already-exists', 'This wave request belongs to different details.');
    }
    return row;
}
function checkNotification(receipt, notification, row) {
    if (!notification.exists || !receipt.createTime || !notification.createTime || !receipt.createTime.isEqual(notification.createTime)
        || notification.id !== row.notification_id || mapWaveHash(notificationFields(notification.data())) !== row.notification_fingerprint)
        stale();
}
async function finalCheck(auth, value, currentTime) {
    await Promise.all([checkAuth(auth, value.actor), checkAuth(auth, value.target)]);
    if (value.expires <= currentTime())
        return unavailable();
}
export async function manageMapWaveForUid(db, auth, uid, raw, now = Date.now()) {
    const started = Date.now(), clock = () => now + Math.max(0, Date.now() - started), input = normalize(raw, uid), fingerprint = mapWaveHash(input);
    return db.runTransaction(async (tx) => {
        const value = await access(db, tx, auth, input, clock());
        const receiptId = mapWaveHash([uid, value.actor.created, input.requestId]), receiptRef = db.doc(`_map_wave_receipts/${receiptId}`), receipt = await tx.get(receiptRef);
        const base = (sentAt, notificationId, replayed) => {
            const serverTime = clock();
            return { ok: true, action: 'send', ownerUid: uid, profileId: value.actor.profileId, accountCreatedAt: value.actor.created,
                targetProfileId: value.target.profileId, requestId: input.requestId, accessRevision: input.expectedAccessRevision, status: 'sent', notificationId,
                sentAt, cooldownUntil: sentAt + cooldownMs, serverTime, validUntil: Math.min(serverTime + leaseMs, value.expires), replayed };
        };
        if (receipt.exists) {
            const row = checkedReceipt(receipt.data(), input, fingerprint);
            checkDependencies(row, value);
            checkNotification(receipt, await tx.get(db.doc(`notifications/${row.notification_id}`)), row);
            await finalCheck(auth, value, clock);
            return base(row.sent_at_ms, row.notification_id, true);
        }
        const cooldownRef = db.doc(`_map_wave_cooldowns/${mapWaveHash([uid, value.actor.created, value.target.uid, value.target.created])}`), previous = (await tx.get(cooldownRef)).data();
        if (previous && (previous.version !== 1 || previous.owner_uid !== uid || previous.target_uid !== value.target.uid || !integer(previous.until_ms)))
            throw new HttpsError('failed-precondition', 'Your previous wave needs review. Retry later.');
        await finalCheck(auth, value, clock);
        const sentAt = clock();
        if (previous && Number(previous.until_ms) > sentAt)
            throw new HttpsError('resource-exhausted', 'You recently waved at this friend. Please wait a moment.', { serverTime: sentAt, cooldownUntil: previous.until_ms });
        const notificationId = `map-wave-${receiptId}`, notification = { user_id: value.target.profileId, actor_id: value.actor.profileId, type: 'map_wave', title: actorName(value.actor),
            body: 'waved at you on VybeMap 👋', deep_link: '/map', created_at: new Date(sentAt).toISOString(), wave_receipt_id: receiptId };
        tx.create(db.doc(`notifications/${notificationId}`), { ...notification, read: false });
        tx.create(receiptRef, { version: 1, owner_uid: uid, profile_id: value.actor.profileId, account_created_at_ms: value.actor.created,
            target_uid: value.target.uid, target_profile_id: value.target.profileId, target_account_created_at_ms: value.target.created,
            actor_binding_revision: value.actor.binding, target_binding_revision: value.target.binding, request_id: input.requestId, request: input, fingerprint,
            dependencies: dependencies(value), notification_id: notificationId, notification_fingerprint: mapWaveHash(notification), sent_at_ms: sentAt, cooldown_until_ms: sentAt + cooldownMs });
        tx.set(cooldownRef, { version: 1, owner_uid: uid, target_uid: value.target.uid, until_ms: sentAt + cooldownMs, expireAt: Timestamp.fromMillis(sentAt + dayMs) });
        return base(sentAt, notificationId, false);
    });
}
const dayMs = 86400000;
//# sourceMappingURL=mapWaveAuthority.js.map