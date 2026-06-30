import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db, requireAuth } from './_shared/admin.js';
/**
 * Parental PIN: stored server-side as SHA-256(salt + pin) with a per-user salt.
 * The hash never leaves the server — clients call `setParentalPin` / `verifyParentalPin`.
 * (bcrypt/argon2 would be stronger; SHA-256 + salt is acceptable for a 4-digit PIN
 * because the comparison only happens server-side and the hash is never exposed.)
 */
function hashPinWithSalt(pin, salt) {
    return createHash('sha256').update(`${salt}:${pin}`).digest('hex');
}
function isValidPin(pin) {
    return typeof pin === 'string' && /^\d{4,8}$/.test(pin);
}
export const setParentalPin = onCall(async (request) => {
    const uid = requireAuth(request);
    const { pin, settings } = (request.data || {});
    if (!isValidPin(pin))
        throw new HttpsError('invalid-argument', 'PIN must be 4–8 digits');
    const salt = randomBytes(16).toString('hex');
    const pin_hash = hashPinWithSalt(pin, salt);
    const now = new Date().toISOString();
    const ref = db.collection('parental_controls').doc(uid);
    const prev = await ref.get();
    const merged = {
        user_id: uid,
        is_active: true,
        content_filter_level: settings?.content_filter_level || 'protected',
        max_screen_time_minutes: settings?.max_screen_time_minutes ?? 120,
        allowed_features: settings?.allowed_features || ['messaging', 'feed', 'profile'],
        pin_hash,
        pin_salt: salt,
        pin_algo: 'sha256-v1',
        created_at: prev.exists ? prev.data()?.created_at || now : now,
        updated_at: now,
    };
    await ref.set(merged, { merge: true });
    // Never return the hash/salt to the client.
    const { pin_hash: _h, pin_salt: _s, ...safe } = merged;
    return { ok: true, controls: safe };
});
export const verifyParentalPin = onCall(async (request) => {
    const uid = requireAuth(request);
    const { pin } = (request.data || {});
    if (!isValidPin(pin))
        return { ok: false };
    const snap = await db.collection('parental_controls').doc(uid).get();
    if (!snap.exists)
        return { ok: false };
    const data = snap.data();
    const salt = data.pin_salt || '';
    const stored = data.pin_hash || '';
    if (!salt || !stored)
        return { ok: false };
    const candidate = hashPinWithSalt(pin, salt);
    let ok = false;
    try {
        const a = Buffer.from(candidate, 'hex');
        const b = Buffer.from(stored, 'hex');
        ok = a.length === b.length && timingSafeEqual(a, b);
    }
    catch {
        ok = false;
    }
    return { ok };
});
export const getParentalControlsSafe = onCall(async (request) => {
    const uid = requireAuth(request);
    const snap = await db.collection('parental_controls').doc(uid).get();
    if (!snap.exists)
        return { controls: null };
    const data = snap.data();
    const { pin_hash, pin_salt, ...safe } = data;
    return { controls: { ...safe, has_pin: Boolean(pin_hash) } };
});
export const updateParentalControls = onCall(async (request) => {
    const uid = requireAuth(request);
    const { updates } = (request.data || {});
    if (!updates || typeof updates !== 'object') {
        throw new HttpsError('invalid-argument', 'updates required');
    }
    // Reject attempts to overwrite PIN material via this path.
    const safeUpdates = {};
    for (const [k, v] of Object.entries(updates)) {
        if (k === 'pin_hash' || k === 'pin_salt' || k === 'pin_algo' || k === 'user_id')
            continue;
        safeUpdates[k] = v;
    }
    safeUpdates.updated_at = new Date().toISOString();
    await db.collection('parental_controls').doc(uid).set(safeUpdates, { merge: true });
    return { ok: true };
});
//# sourceMappingURL=parental.js.map