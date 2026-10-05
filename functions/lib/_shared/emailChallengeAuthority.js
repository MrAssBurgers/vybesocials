import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
const CODE_LIFETIME = 10 * 60_000;
const FLOW_LIFETIME = 30 * 60_000;
const idPattern = /^[A-Za-z0-9_-]{1,160}$/;
const millis = (value) => typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
const hash = (code, salt) => createHmac('sha256', salt).update(code).digest('hex');
const invalid = () => new HttpsError('failed-precondition', 'This sign-in request is no longer valid. Sign in again.');
function challengeId(value) {
    if (typeof value !== 'string' || !idPattern.test(value))
        throw new HttpsError('invalid-argument', 'A valid challengeId is required.');
    return value;
}
async function currentAccount(auth, uid) {
    const user = await auth.getUser(uid).catch(() => { throw invalid(); });
    if (user.disabled || !user.email || !user.metadata.creationTime)
        throw invalid();
    return { uid, email: user.email, created: user.metadata.creationTime };
}
function sameAccount(row, account) {
    return row.owner_uid === account.uid && row.email === account.email && row.auth_created_at === account.created;
}
function pending(row, uid, now) {
    if (!row || row.user_id !== uid || row.status !== 'pending'
        || !['email_2fa', 'login_approval'].includes(row.challenge_type)
        || !(millis(row.created_at) > 0) || millis(row.created_at) > now + 60_000
        || millis(row.created_at) + FLOW_LIFETIME <= now)
        throw invalid();
}
function cleanMetadata(row) {
    const metadata = { ...(row.metadata || {}) };
    for (const key of ['code_hash', 'code_salt', 'custom_token', 'pending_session'])
        delete metadata[key];
    return { ...metadata, code_channel: 'email', switched_to: 'email_code' };
}
/** Additional email confirmation, not a replacement for server-enforced Firebase MFA. */
export async function requestEmailChallenge(db, auth, send, callerUid, input, options = {}) {
    const existing = input.challengeId !== undefined;
    if (!existing && !callerUid)
        throw new HttpsError('unauthenticated', 'Sign in required.');
    const id = existing ? challengeId(input.challengeId) : randomBytes(24).toString('hex');
    const publicRef = db.doc(`auth_challenges/${id}`), secretRef = db.doc(`_auth_email_challenges/${id}`);
    const initial = existing ? (await publicRef.get()).data() : undefined;
    const uid = existing ? initial?.user_id : callerUid;
    if (typeof uid !== 'string' || (callerUid && uid !== callerUid)
        || (input.expectedOwnerUid !== undefined && input.expectedOwnerUid !== uid))
        throw invalid();
    const account = await currentAccount(auth, uid);
    const now = Date.now(), revision = randomBytes(24).toString('hex');
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const salt = randomBytes(32).toString('hex');
    const quotaRef = db.doc(`_auth_email_limits/${uid}`);
    const expiresAt = await db.runTransaction(async (tx) => {
        const [publicSnap, secretSnap, quotaSnap] = await tx.getAll(publicRef, secretRef, quotaRef);
        const row = publicSnap.data(), secret = secretSnap.data(), quota = quotaSnap.data();
        if (existing) {
            pending(row, uid, now);
            // Old public hash rows are not attested. Email flows need private proof;
            // a current device-approval challenge can deliberately switch channels.
            if (row.challenge_type === 'email_2fa' && (!secret || !sameAccount(secret, account)))
                throw invalid();
            if (row.challenge_type === 'login_approval' && !options.allowLoginSwitch
                && (row.channel !== 'email' || row.metadata?.switched_to !== 'email_code' || !secret))
                throw invalid();
            if (row.challenge_type === 'login_approval' && !(millis(row.expires_at) > now))
                throw invalid();
            if (secret && (!sameAccount(secret, account) || secret.status === 'consumed' || secret.attempts >= 10))
                throw invalid();
            if (secret?.status === 'sending' && secret.started_at + 30_000 > now) {
                throw new HttpsError('unavailable', 'The previous email is still being sent. Try again shortly.');
            }
        }
        else if (row || secret)
            throw invalid();
        const count = quota && quota.reset_at > now ? quota.count : 0;
        if (!Number.isInteger(count) || count >= 5)
            throw new HttpsError('resource-exhausted', 'Too many email requests. Try again later.');
        const createdAt = existing ? millis(row.created_at) : now;
        const expiry = Math.min(now + CODE_LIFETIME, createdAt + FLOW_LIFETIME);
        tx.set(quotaRef, { count: count + 1, reset_at: count ? quota.reset_at : now + CODE_LIFETIME, expireAt: Timestamp.fromMillis(now + 86400_000) });
        tx.set(secretRef, {
            version: 1, owner_uid: uid, auth_created_at: account.created, email: account.email,
            revision, status: 'sending', code_hash: hash(code, salt), code_salt: salt,
            attempts: secret?.attempts || 0, started_at: now, expires_at: expiry, expireAt: Timestamp.fromMillis(now + 86400_000),
        });
        // Remove legacy secrets even on a failed send; private status is the authority.
        const publicFields = {
            user_id: uid, challenge_type: row?.challenge_type || 'email_2fa', status: 'pending',
            created_at: new Date(createdAt).toISOString(), expires_at: new Date(expiry).toISOString(),
            channel: 'email', email_revision: revision, metadata: cleanMetadata(row || {}),
            code_hash: FieldValue.delete(), code_salt: FieldValue.delete(), email: FieldValue.delete(),
        };
        // Explicit top-level merge replaces metadata instead of recursively
        // retaining legacy code/token keys that cleanMetadata removed.
        tx.set(publicRef, publicFields, { mergeFields: Object.keys(publicFields) });
        return expiry;
    });
    let delivered = false;
    try {
        delivered = await send(account.email, code, revision);
    }
    catch { /* Safe error below. */ }
    const fresh = await currentAccount(auth, uid).catch(() => null);
    const accepted = await db.runTransaction(async (tx) => {
        const [publicSnap, secretSnap] = await tx.getAll(publicRef, secretRef);
        const row = publicSnap.data(), secret = secretSnap.data();
        if (!secret || secret.revision !== revision || secret.status !== 'sending')
            return false;
        const valid = delivered && fresh && sameAccount(secret, fresh) && row?.status === 'pending'
            && row.user_id === uid && row.channel === 'email' && row.email_revision === revision
            && row.metadata?.switched_to === 'email_code' && secret.expires_at > Date.now();
        tx.update(secretRef, valid ? { status: 'pending' } : {
            status: 'failed', code_hash: FieldValue.delete(), code_salt: FieldValue.delete(),
        });
        return !!valid;
    });
    if (!accepted)
        throw new HttpsError('unavailable', 'A verification email could not be confirmed. Try again.');
    const [local, domain] = account.email.split('@');
    return { ok: true, ownerUid: uid, challengeId: id, expiresAt: new Date(expiresAt).toISOString(), email: `${local.slice(0, 2)}***@${domain}`, mode: 'code' };
}
export async function verifyEmailChallenge(db, auth, callerUid, input) {
    const id = challengeId(input.challengeId);
    if (typeof input.code !== 'string' || !/^\d{6}$/.test(input.code))
        throw new HttpsError('invalid-argument', 'Enter the full six-digit code.');
    const provided = input.code;
    const publicRef = db.doc(`auth_challenges/${id}`), secretRef = db.doc(`_auth_email_challenges/${id}`);
    const initial = (await secretRef.get()).data();
    if (!initial || typeof initial.owner_uid !== 'string' || (callerUid && callerUid !== initial.owner_uid))
        throw invalid();
    const account = await currentAccount(auth, initial.owner_uid);
    const checked = await db.runTransaction(async (tx) => {
        const [publicSnap, secretSnap] = await tx.getAll(publicRef, secretRef);
        const row = publicSnap.data(), secret = secretSnap.data(), now = Date.now();
        pending(row, account.uid, now);
        if (!secret || !sameAccount(secret, account) || secret.status !== 'pending' || secret.version !== 1
            || secret.expires_at <= now || millis(row.expires_at) <= now || secret.attempts >= 10
            || row.channel !== 'email' || row.metadata?.switched_to !== 'email_code'
            || row.email_revision !== secret.revision || !/^[a-f0-9]{64}$/.test(secret.code_hash || '')
            || !/^[a-f0-9]{64}$/.test(secret.code_salt || ''))
            throw invalid();
        const matches = timingSafeEqual(Buffer.from(secret.code_hash, 'hex'), Buffer.from(hash(provided, secret.code_salt), 'hex'));
        tx.update(secretRef, { attempts: secret.attempts + 1 });
        return { matches, revision: secret.revision };
    });
    if (!checked.matches)
        throw new HttpsError('permission-denied', 'Incorrect code.');
    // Minting grants nothing to the caller until the one-use transaction commits.
    // No custom token is ever stored in a client-readable document.
    const token = await auth.createCustomToken(account.uid, { email_2fa: id });
    const fresh = await currentAccount(auth, account.uid);
    await db.runTransaction(async (tx) => {
        const [publicSnap, secretSnap] = await tx.getAll(publicRef, secretRef);
        const row = publicSnap.data(), secret = secretSnap.data(), now = Date.now();
        pending(row, account.uid, now);
        if (!secret || !sameAccount(secret, fresh) || secret.revision !== checked.revision
            || secret.status !== 'pending' || secret.expires_at <= now || millis(row.expires_at) <= now
            || row.email_revision !== checked.revision || row.channel !== 'email'
            || row.metadata?.switched_to !== 'email_code')
            throw invalid();
        tx.update(secretRef, { status: 'consumed', consumed_at: now, code_hash: FieldValue.delete(), code_salt: FieldValue.delete() });
        tx.update(publicRef, {
            status: 'approved', resolved_at: new Date(now).toISOString(), metadata: cleanMetadata(row),
            code_hash: FieldValue.delete(), code_salt: FieldValue.delete(),
        });
    });
    return { ok: true, status: 'approved', customToken: token };
}
//# sourceMappingURL=emailChallengeAuthority.js.map