import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity } from './profileAudienceAuthority.js';
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const date = (value) => typeof value === 'string' ? Date.parse(value) : NaN;
const positive = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
export const loginDeviceVersion = (value) => value ? `${value.seconds}:${value.nanoseconds}` : 'missing';
const resume = (method) => ['session_resume', 'app_open', 'heartbeat'].includes(method);
const unavailable = () => new HttpsError('unavailable', 'This device sign-in could not be checked. Please retry.');
const revoked = () => new HttpsError('unauthenticated', 'This device was signed out. Sign in again with fresh credentials.', { reason: 'device-session-revoked' });
const setupRequired = () => new HttpsError('failed-precondition', 'Your account profile must finish its ownership check before this device can be registered.', { reason: 'profile-setup-required' });
export const loginDeviceHeadId = (uid, created, fingerprint) => hash([uid, created, fingerprint]);
async function currentUser(auth, uid, input, authTime, now) {
    let user;
    try {
        user = await auth.getUser(uid);
    }
    catch (error) {
        if (error?.code === 'auth/user-not-found')
            throw revoked();
        throw unavailable();
    }
    const created = date(user.metadata.creationTime), cutoff = user.tokensValidAfterTime === undefined ? 0 : date(user.tokensValidAfterTime);
    if (user.uid !== uid || user.disabled || created !== input.expectedAccountCreatedAt)
        throw revoked();
    if (!Number.isFinite(cutoff))
        throw unavailable();
    if (authTime * 1000 < cutoff || authTime * 1000 < Math.floor(created / 1000) * 1000 || authTime * 1000 > now + 1000)
        throw revoked();
    return user;
}
/** Device bookkeeping cannot revive revoked credentials. A fresh interactive
 * sign-in creates a new generation; the old revoked row is never cleared. */
export async function registerLoginDevice(db, auth, uid, authTime, raw, metadata = {}, now = Date.now()) {
    const input = raw;
    if (!input || input.expectedOwnerUid !== uid || !positive(authTime) || input.expectedAuthTime !== authTime || !positive(input.expectedAccountCreatedAt))
        throw new HttpsError('failed-precondition', 'Your sign-in changed. Please retry.');
    if (typeof input.deviceFingerprint !== 'string' || !input.deviceFingerprint || input.deviceFingerprint.length > 160 || [...input.deviceFingerprint].some(char => char.charCodeAt(0) < 32)
        || !['password', 'oauth', 'login_approval', 'email_2fa', 'session_resume', 'app_open', 'heartbeat'].includes(input.method))
        throw new HttpsError('invalid-argument', 'Valid device details are required.');
    await currentUser(auth, uid, input, authTime, now);
    const headRef = db.doc(`_auth_device_session_heads/${loginDeviceHeadId(uid, input.expectedAccountCreatedAt, input.deviceFingerprint)}`);
    return db.runTransaction(async (tx) => {
        const identity = await resolveIdentity(db, tx, uid);
        const binding = (await tx.get(db.doc(`_account_profile_bindings/${uid}`))).data();
        const base = { ownerUid: uid, authTime, accountCreatedAt: input.expectedAccountCreatedAt };
        if (!identity || identity.uid !== uid || !binding) {
            // Only a genuinely new account may finish confirmation before its normal
            // checked profile bootstrap. Existing identity/security state is not a bypass.
            const [direct, profiles, index, sessions, settings, challenges] = await Promise.all([
                tx.get(db.doc(`profiles/${uid}`)), tx.get(db.collection('profiles').where('user_id', '==', uid).limit(1)), tx.get(db.doc(`user_auth_index/${uid}`)),
                tx.get(db.collection('user_sessions').where('user_id', '==', uid).limit(1)), tx.get(db.doc(`user_2fa_settings/${uid}`)),
                tx.get(db.collection('auth_challenges').where('user_id', '==', uid).where('status', '==', 'pending').limit(1)),
            ]);
            if (identity || binding || direct.exists || !profiles.empty || index.exists || !sessions.empty || settings.exists || !challenges.empty)
                throw setupRequired();
            await currentUser(auth, uid, input, authTime, now);
            return { ...base, profileId: null, trackingDeferred: true, sessionId: null, created: false, row: null };
        }
        if (binding.version !== 1 || binding.status !== 'active' || binding.owner_uid !== uid || binding.profile_id !== identity.profileId
            || binding.auth_created_at_ms !== input.expectedAccountCreatedAt || typeof binding.revision !== 'string' || !/^[a-f0-9]{48}$/.test(binding.revision))
            throw setupRequired();
        const headSnapshot = await tx.get(headRef), head = headSnapshot.data();
        let previous = null;
        if (head) {
            if (head.version !== 1 || head.owner_uid !== uid || head.profile_id !== identity.profileId || head.account_created_at_ms !== input.expectedAccountCreatedAt
                || head.binding_revision !== binding.revision || typeof head.session_id !== 'string' || !head.session_id || head.session_id.includes('/'))
                throw setupRequired();
            const session = await tx.get(db.doc(`user_sessions/${head.session_id}`));
            if (!session.exists)
                throw new HttpsError('failed-precondition', 'This device record is missing. Contact support to repair its sign-in history.');
            const sourceTime = head.session_origin === 'created' ? headSnapshot.updateTime : head.session_create_time;
            if (!session.createTime || !sourceTime?.isEqual?.(session.createTime))
                throw setupRequired();
            previous = { id: session.id, row: session.data(), createTime: session.createTime };
        }
        else {
            const history = await tx.get(db.collection('user_sessions').where('user_id', '==', uid).where('session_token_hash', '==', input.deviceFingerprint).limit(201));
            if (history.size > 200)
                throw new HttpsError('resource-exhausted', 'This device has too many older sign-in records. Contact support to review its history.');
            const allRows = history.docs.map(doc => ({ id: doc.id, row: doc.data(), createTime: doc.createTime }));
            if (allRows.some(item => !Number.isFinite(date(item.row.created_at)) || (item.row.account_created_at_ms !== undefined && !positive(item.row.account_created_at_ms))))
                throw setupRequired();
            // History belonging to a deleted earlier Auth incarnation is retained,
            // but cannot supply this incarnation's trusted device or revocation state.
            const rows = allRows.filter(item => item.row.account_created_at_ms === undefined
                ? date(item.row.created_at) >= input.expectedAccountCreatedAt
                : item.row.account_created_at_ms === input.expectedAccountCreatedAt);
            rows.sort((left, right) => date(right.row.created_at) - date(left.row.created_at) || right.id.localeCompare(left.id));
            previous = rows[0] ?? null;
            // A later legacy row must never hide an earlier revocation cutoff.
            const revokedRows = rows.filter(item => item.row.revoked_at != null);
            if (revokedRows.some(item => !Number.isFinite(date(item.row.revoked_at))))
                throw setupRequired();
            const newestRevoked = revokedRows.sort((left, right) => date(right.row.revoked_at) - date(left.row.revoked_at))[0];
            if (newestRevoked && (!previous || !positive(previous.row.auth_time) || Number(previous.row.auth_time) * 1000 <= date(newestRevoked.row.revoked_at)))
                previous = newestRevoked;
        }
        if (previous && (previous.row.user_id !== uid || previous.row.session_token_hash !== input.deviceFingerprint
            || (previous.row.account_created_at_ms !== undefined && previous.row.account_created_at_ms !== input.expectedAccountCreatedAt)
            || (previous.row.profile_id !== undefined && previous.row.profile_id !== identity.profileId)
            || (previous.row.binding_revision !== undefined && previous.row.binding_revision !== binding.revision)
            || date(previous.row.created_at) < input.expectedAccountCreatedAt))
            throw setupRequired();
        const priorRevoked = previous?.row.revoked_at;
        if (priorRevoked != null) {
            if (!Number.isFinite(date(priorRevoked)))
                throw setupRequired();
            if (resume(input.method) || authTime * 1000 <= date(priorRevoked))
                throw revoked();
        }
        const created = !previous || priorRevoked != null;
        if (resume(input.method)) {
            const settings = (await tx.get(db.doc(`user_2fa_settings/${uid}`))).data();
            if ((previous && (previous.row.trusted === false || previous.row.pending_approval === true))
                || (created && ['login_approvals_enabled', 'email_2fa_enabled'].some(key => settings?.[key] !== undefined && settings[key] !== false))) {
                throw new HttpsError('failed-precondition', 'Finish the sign-in confirmation before resuming this device.', { ...base, reason: 'sign-in-confirmation-pending' });
            }
        }
        const sessionId = created ? `device-${hash([uid, input.expectedAccountCreatedAt, input.deviceFingerprint, authTime, previous?.id ?? null])}` : previous.id;
        const sessionRef = db.doc(`user_sessions/${sessionId}`);
        if (created && (await tx.get(sessionRef)).exists)
            throw setupRequired();
        const row = created ? { ...metadata, user_id: uid, profile_id: identity.profileId, session_token_hash: input.deviceFingerprint,
            auth_time: authTime, account_created_at_ms: input.expectedAccountCreatedAt, binding_revision: binding.revision, created_at: new Date(now).toISOString(), last_seen_at: new Date(now).toISOString(),
            trusted: resume(input.method), pending_approval: false, revoked_at: null } : previous.row;
        await currentUser(auth, uid, input, authTime, now);
        if (created)
            tx.create(sessionRef, row);
        if (!head || created)
            tx.set(headRef, { version: 1, owner_uid: uid, profile_id: identity.profileId, account_created_at_ms: input.expectedAccountCreatedAt,
                binding_revision: binding.revision, session_id: sessionId, session_origin: created ? 'created' : 'legacy', session_create_time: created ? null : previous.createTime });
        return { ...base, profileId: identity.profileId, trackingDeferred: false, sessionId, created, row };
    });
}
/** All later confirmation updates/receipts recheck the same registered row.
 * Update-only writes cannot revive deleted/recreated or superseded sessions. */
export async function withCurrentLoginDevice(db, auth, registered, fingerprint, mutate, now = Date.now(), options = {}) {
    const uid = registered.ownerUid, authTime = registered.authTime;
    const raw = { expectedOwnerUid: uid, expectedAuthTime: authTime, expectedAccountCreatedAt: registered.accountCreatedAt, deviceFingerprint: fingerprint, method: 'checked' };
    if (registered.trackingDeferred || !registered.sessionId)
        throw setupRequired();
    await currentUser(auth, uid, raw, authTime, now);
    return db.runTransaction(async (tx) => {
        const identity = await resolveIdentity(db, tx, uid), ref = db.doc(`user_sessions/${registered.sessionId}`);
        const [session, head, binding, settings] = await tx.getAll(ref, db.doc(`_auth_device_session_heads/${loginDeviceHeadId(uid, raw.expectedAccountCreatedAt, raw.deviceFingerprint)}`), db.doc(`_account_profile_bindings/${uid}`), db.doc(`user_2fa_settings/${uid}`));
        const row = session.data(), current = head.data(), owner = binding.data();
        if (!identity || identity.uid !== uid || identity.profileId !== registered.profileId || owner?.status !== 'active' || owner.owner_uid !== uid
            || owner.profile_id !== identity.profileId || owner.auth_created_at_ms !== raw.expectedAccountCreatedAt || !current || current.binding_revision !== owner.revision
            || current.owner_uid !== uid || current.profile_id !== identity.profileId || current.account_created_at_ms !== raw.expectedAccountCreatedAt
            || current.session_id !== registered.sessionId || !session.createTime || !(current.session_origin === 'created' ? head.updateTime : current.session_create_time)?.isEqual?.(session.createTime)
            || !row || row.user_id !== uid || row.session_token_hash !== raw.deviceFingerprint || row.revoked_at != null)
            throw revoked();
        const changedGate = () => new HttpsError('aborted', 'Your sign-in confirmation changed. Please retry.');
        if (options.confirmation === 'trusted' && (row.trusted === false || row.pending_approval === true))
            throw changedGate();
        if (options.confirmation === 'pending' && (row.trusted !== false || row.pending_approval !== true))
            throw changedGate();
        if (options.trust) {
            if (loginDeviceVersion(settings.updateTime) !== options.settingsVersion || row.trusted !== registered.row?.trusted || row.pending_approval !== registered.row?.pending_approval)
                throw changedGate();
            if (options.trust === 'approvals-disabled' && settings.data()?.login_approvals_enabled !== false && settings.data()?.login_approvals_enabled !== undefined)
                throw changedGate();
            if (options.trust === 'first-device') {
                const devices = await tx.get(db.collection('user_sessions').where('user_id', '==', uid).limit(201));
                if (devices.size > 200 || devices.docs.some(item => item.id !== registered.sessionId && !item.data().revoked_at))
                    throw changedGate();
            }
        }
        await currentUser(auth, uid, raw, authTime, now);
        return mutate(tx, ref, row);
    });
}
//# sourceMappingURL=loginDeviceAuthority.js.map