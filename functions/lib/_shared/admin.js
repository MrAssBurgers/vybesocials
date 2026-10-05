import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { HttpsError } from 'firebase-functions/v2/https';
if (!getApps().length)
    initializeApp();
export const db = getFirestore();
export const auth = getAuth();
export const messaging = getMessaging();
export function requireAuth(request) {
    if (!request.auth)
        throw new HttpsError('unauthenticated', 'Sign in required');
    return request.auth.uid;
}
export async function requireAdmin(request) {
    const uid = requireAuth(request);
    const binding = (await db.collection('_account_profile_bindings').doc(uid).get()).data();
    if (binding && (binding.version !== 1 || binding.owner_uid !== uid || binding.status !== 'active'
        || typeof binding.profile_id !== 'string' || !binding.profile_id)) {
        throw new HttpsError('permission-denied', 'This account identity is retired. Sign in to the current account.');
    }
    if (request.auth?.token?.admin === true)
        return uid;
    const directProfile = (await db.collection('profiles').doc(uid).get()).data();
    if (directProfile && (directProfile.user_id !== uid || directProfile.is_deleted === true || directProfile.deleted_at)) {
        throw new HttpsError('permission-denied', 'This account identity needs an ownership review.');
    }
    const snap = await db.collection('user_roles')
        .where('user_id', '==', uid)
        .where('role', 'in', ['admin', 'owner'])
        .get();
    // Legacy grants omit enabled. An explicit false or malformed value cannot
    // grant access; a disabled first row must not hide a separate active grant.
    const active = snap.docs.some(doc => {
        const role = doc.data();
        return !Object.hasOwn(role, 'enabled') || role.enabled === true;
    });
    if (!active)
        throw new HttpsError('permission-denied', 'Admin only');
    return uid;
}
/** Simple Firestore-backed rate limiter. Returns true if request should be allowed. */
export async function rateLimit(key, max, windowSec) {
    const now = Date.now();
    const ref = db.collection('_rate_limits').doc(key);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.data();
        if (!data || (data.reset_at ?? 0) < now) {
            tx.set(ref, { count: 1, reset_at: now + windowSec * 1000 });
            return true;
        }
        if ((data.count ?? 0) >= max)
            return false;
        tx.update(ref, { count: (data.count ?? 0) + 1 });
        return true;
    });
}
export function enforceRateLimit(allowed) {
    if (!allowed)
        throw new HttpsError('resource-exhausted', 'Rate limit exceeded');
}
//# sourceMappingURL=admin.js.map