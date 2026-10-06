import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db, requireAuth } from './_shared/admin.js';
const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const validPin = (pin) => typeof pin === 'string' && /^\d{4,8}$/.test(pin);
const lockWindow = 5 * 60 * 1000;
const fields = new Set(['is_active', 'content_filter_level', 'max_screen_time_minutes', 'allowed_features']);
function settings(raw) {
    if (!object(raw) || Object.keys(raw).some(key => !fields.has(key))
        || (raw.is_active !== undefined && typeof raw.is_active !== 'boolean')
        || (raw.content_filter_level !== undefined && (typeof raw.content_filter_level !== 'string' || !['protected', 'moderate', 'unrestricted'].includes(raw.content_filter_level)))
        || (raw.max_screen_time_minutes !== undefined && raw.max_screen_time_minutes !== null
            && (!Number.isInteger(raw.max_screen_time_minutes) || Number(raw.max_screen_time_minutes) < 1 || Number(raw.max_screen_time_minutes) > 1440))
        || (raw.allowed_features !== undefined && raw.allowed_features !== null
            && (!Array.isArray(raw.allowed_features) || raw.allowed_features.length > 32
                || raw.allowed_features.some(value => typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(value))))) {
        throw new HttpsError('invalid-argument', 'Use valid parental-control settings.');
    }
    return raw;
}
function owned(row, uid) {
    if (row && row.user_id !== uid)
        throw new HttpsError('failed-precondition', 'These controls need an ownership review. Nothing was changed.');
}
function caller(raw, uid) {
    if (raw.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen parental controls.');
}
function material(row) {
    if (typeof row.pin_salt !== 'string' || !/^[a-f0-9]{32,64}$/.test(row.pin_salt)
        || typeof row.pin_hash !== 'string' || !/^[a-f0-9]{64}$/.test(row.pin_hash)
        || ![undefined, 'sha256-v1', 'scrypt-v2'].includes(row.pin_algo)) {
        throw new HttpsError('failed-precondition', 'These controls need a PIN recovery review. Nothing was changed.');
    }
    return { salt: row.pin_salt, hash: row.pin_hash, algorithm: row.pin_algo };
}
function matches(row, pin) {
    const stored = material(row);
    if (!validPin(pin))
        return false;
    const candidate = stored.algorithm === 'scrypt-v2'
        ? scryptSync(pin, stored.salt, 32, { N: 16384, r: 8, p: 1 })
        : createHash('sha256').update(`${stored.salt}:${pin}`).digest();
    return timingSafeEqual(candidate, Buffer.from(stored.hash, 'hex'));
}
function safe(row) {
    return { user_id: row.user_id, is_active: row.is_active, content_filter_level: row.content_filter_level,
        max_screen_time_minutes: row.max_screen_time_minutes, allowed_features: row.allowed_features,
        created_at: row.created_at, updated_at: row.updated_at, has_pin: Boolean(row.pin_hash) };
}
function check(row, pin, now) {
    const failures = row.pin_failures ?? 0, until = row.pin_lock_until ?? 0;
    if (!Number.isSafeInteger(failures) || Number(failures) < 0 || Number(failures) > 5
        || !Number.isSafeInteger(until) || Number(until) < 0)
        throw new HttpsError('failed-precondition', 'PIN attempts need a recovery review.');
    if (Number(until) > now)
        return { ok: false, limited: true, patch: {} };
    if (matches(row, pin))
        return { ok: true, limited: false, patch: { pin_failures: 0, pin_lock_until: 0 } };
    const next = (Number(until) > 0 ? 0 : Number(failures)) + 1;
    return { ok: false, limited: false, patch: { pin_failures: next, pin_lock_until: next >= 5 ? now + lockWindow : 0 } };
}
function fail(result) {
    if (result.limited)
        throw new HttpsError('resource-exhausted', 'Too many PIN attempts. Wait five minutes and try again.');
    if (result.denied)
        throw new HttpsError('permission-denied', 'Enter the current parental PIN to make changes.');
}
export const setParentalPin = onCall(async (request) => {
    const uid = requireAuth(request), raw = object(request.data) ? request.data : {};
    caller(raw, uid);
    if (!validPin(raw.pin))
        throw new HttpsError('invalid-argument', 'PIN must be 4–8 digits.');
    if (Object.keys(raw).some(key => !['pin', 'currentPin', 'settings', 'expectedOwnerUid'].includes(key)))
        throw new HttpsError('invalid-argument', 'Invalid PIN setup details.');
    const input = raw.settings === undefined ? {} : settings(raw.settings);
    let nextMaterial;
    const ref = db.collection('parental_controls').doc(uid);
    const result = await db.runTransaction(async (tx) => {
        const prev = (await tx.get(ref)).data();
        owned(prev, uid);
        const now = Date.now();
        if (prev) {
            const proof = check(prev, raw.currentPin, now);
            if (proof.limited)
                return { limited: true };
            if (!proof.ok) {
                tx.set(ref, proof.patch, { merge: true });
                return { denied: true };
            }
        }
        if (!nextMaterial) {
            const salt = randomBytes(16).toString('hex');
            nextMaterial = { salt, hash: scryptSync(raw.pin, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex') };
        }
        const time = new Date(now).toISOString();
        const merged = { ...(prev ?? {}), user_id: uid, is_active: prev?.is_active ?? true,
            content_filter_level: prev?.content_filter_level ?? 'protected',
            max_screen_time_minutes: prev && Object.hasOwn(prev, 'max_screen_time_minutes') ? prev.max_screen_time_minutes : 120,
            allowed_features: prev && Object.hasOwn(prev, 'allowed_features') ? prev.allowed_features : ['messaging', 'feed', 'profile'], ...input,
            pin_hash: nextMaterial.hash, pin_salt: nextMaterial.salt, pin_algo: 'scrypt-v2', pin_failures: 0, pin_lock_until: 0,
            created_at: prev?.created_at ?? time, updated_at: time };
        tx.set(ref, merged);
        return { controls: safe(merged) };
    });
    fail(result);
    return { ok: true, controls: 'controls' in result ? result.controls : undefined };
});
export const verifyParentalPin = onCall(async (request) => {
    const uid = requireAuth(request), raw = object(request.data) ? request.data : {};
    caller(raw, uid);
    if (Object.keys(raw).some(key => !['pin', 'expectedOwnerUid'].includes(key)))
        throw new HttpsError('invalid-argument', 'Invalid PIN verification details.');
    const ref = db.collection('parental_controls').doc(uid);
    const result = await db.runTransaction(async (tx) => {
        const row = (await tx.get(ref)).data();
        owned(row, uid);
        if (!row)
            return { ok: false, limited: false };
        const proof = check(row, raw.pin, Date.now());
        if (!proof.limited)
            tx.set(ref, proof.patch, { merge: true });
        return { ok: proof.ok, limited: proof.limited };
    });
    fail(result);
    return { ok: result.ok };
});
export const getParentalControlsSafe = onCall(async (request) => {
    const uid = requireAuth(request), row = (await db.collection('parental_controls').doc(uid).get()).data();
    owned(row, uid);
    return { controls: row ? safe(row) : null };
});
export const updateParentalControls = onCall(async (request) => {
    const uid = requireAuth(request), raw = object(request.data) ? request.data : {};
    caller(raw, uid);
    if (Object.keys(raw).some(key => !['pin', 'updates', 'expectedOwnerUid'].includes(key)))
        throw new HttpsError('invalid-argument', 'Invalid control update details.');
    const input = settings(raw.updates);
    const ref = db.collection('parental_controls').doc(uid);
    const result = await db.runTransaction(async (tx) => {
        const row = (await tx.get(ref)).data();
        owned(row, uid);
        if (!row)
            throw new HttpsError('failed-precondition', 'Set up parental controls first.');
        const proof = check(row, raw.pin, Date.now());
        if (proof.limited)
            return { limited: true };
        if (!proof.ok) {
            tx.set(ref, proof.patch, { merge: true });
            return { denied: true };
        }
        tx.set(ref, { ...input, ...proof.patch, updated_at: new Date().toISOString() }, { merge: true });
        return {};
    });
    fail(result);
    return { ok: true };
});
//# sourceMappingURL=parental.js.map