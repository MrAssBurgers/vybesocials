/**
 * VYBE Cloud Functions — Phase 5 entry point.
 *
 * Real implementations live in domain modules (ai, auth, push, realtime,
 * social). Functions still pending a full port are exported from ./stubs.js
 * with a `not_yet_ported` response so the client never hits "function not
 * found" during cutover.
 *
 * Function NAMES match the previous Supabase edge function names so client
 * call sites (`functions.invoke('ai-chat', ...)` etc.) only need their
 * transport swapped to `httpsCallable(functions, 'aiChat')` in Phase 6 —
 * names are exported in camelCase to match Firebase conventions, plus the
 * `setAdminClaim` administration helper.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, auth, requireAdmin } from './_shared/admin.js';
export * from './vybeCheck.js';
export * from './ai.js';
export * from './aiExtras.js';
export * from './aiKeys.js';
export * from './aiDetectText.js';
export * from './auth.js';
export * from './briefs.js';
export * from './email.js';
export * from './passkeys.js';
export * from './push.js';
export * from './pushTriggers.js';
export * from './realtime.js';
export * from './social.js';
export * from './dmSend.js';
export * from './calls.js';
export * from './spotify.js';
export * from './stripe.js';
export * from './stubs.js';
/**
 * Promote a user to admin via custom claim. Bootstrap the first admin
 * manually in Firebase Console → Authentication → User → Custom Claims:
 * `{ "admin": true }`. After that, this callable can manage further admins.
 */
export const setAdminClaim = onCall(async (request) => {
    await requireAdmin(request);
    const { userId, admin: makeAdmin } = (request.data || {});
    if (!userId)
        throw new HttpsError('invalid-argument', 'userId required');
    const user = await auth.getUser(userId);
    await auth.setCustomUserClaims(userId, { ...(user.customClaims || {}), admin: !!makeAdmin });
    await db.collection('user_roles').doc(`${userId}_admin`).set({
        user_id: userId, role: 'admin', enabled: !!makeAdmin, updated_at: new Date().toISOString(),
    }, { merge: true });
    return { ok: true };
});
//# sourceMappingURL=index.js.map