import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, auth, requireAuth, requireAdmin, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { sendPasswordResetEmail } from './_shared/passwordResetEmail.js';
import { claimProfileByEmailForUid } from './_shared/claimProfileByEmail.js';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function code() {
    return String(Math.floor(100000 + Math.random() * 900000));
}
/**
 * request-password-reset — branded HTML via Resend when configured, else Firebase default mailer.
 * Console templates may be locked when custom email domain is pending — this bypasses that.
 */
export const requestPasswordReset = onCall({ cors: true }, async (request) => {
    const email = String(request.data?.email || '')
        .trim()
        .toLowerCase();
    if (!email || !EMAIL_REGEX.test(email)) {
        return { ok: true, message: 'If that email exists, we sent a reset link.' };
    }
    enforceRateLimit(await rateLimit(`pwd-reset:${email}`, 3, 3600));
    let displayName;
    try {
        const userRecord = await auth.getUserByEmail(email);
        displayName = userRecord.displayName || undefined;
    }
    catch {
        return { ok: true, message: 'If that email exists, we sent a reset link.' };
    }
    let provider = 'firebase_auth';
    try {
        provider = await sendPasswordResetEmail(email);
    }
    catch (err) {
        const code = err?.code;
        if (code === 'auth/user-not-found') {
            return { ok: true, message: 'If that email exists, we sent a reset link.' };
        }
        throw err;
    }
    await db.collection('email_send_log').add({
        to: email,
        template: 'reset_password',
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider,
        name: displayName || null,
    });
    return { ok: true, message: 'If that email exists, we sent a reset link.' };
});
/** Link OAuth / new auth uid to migrated profile by email (restores DMs, posts, etc.). */
export const claimProfileByEmail = onCall({ cors: true }, async (request) => {
    const uid = requireAuth(request);
    const result = await claimProfileByEmailForUid(uid);
    return { profileId: result.profileId, claimed: result.claimed };
});
/** auth-2fa-request — issue a 6-digit code (email channel). */
export const auth2faRequest = onCall(async (request) => {
    const uid = requireAuth(request);
    enforceRateLimit(await rateLimit(`2fa-req:${uid}`, 5, 600));
    const c = code();
    await db.collection('auth_challenges').doc(`${uid}_2fa`).set({
        user_id: uid, code_hash: c, channel: 'email',
        expires_at: Date.now() + 10 * 60 * 1000, created_at: new Date().toISOString(),
    });
    // TODO: send email via sendTransactionalEmail
    return { ok: true };
});
/** auth-2fa-verify — confirm a 6-digit code. */
export const auth2faVerify = onCall(async (request) => {
    const uid = requireAuth(request);
    const { code: provided } = (request.data || {});
    if (!provided)
        throw new HttpsError('invalid-argument', 'code required');
    const ref = db.collection('auth_challenges').doc(`${uid}_2fa`);
    const snap = await ref.get();
    const data = snap.data();
    if (!data || data.expires_at < Date.now() || data.code_hash !== provided) {
        throw new HttpsError('permission-denied', 'Invalid or expired code');
    }
    await ref.delete();
    await db.collection('profiles').doc(uid).set({ two_factor_verified_at: new Date().toISOString() }, { merge: true });
    return { ok: true };
});
/** auth-2fa-preauth — start a pre-auth challenge for risky actions. */
export const auth2faPreauth = onCall(async (request) => {
    const uid = requireAuth(request);
    await db.collection('auth_challenges').doc(`${uid}_preauth`).set({
        user_id: uid, expires_at: Date.now() + 5 * 60 * 1000, created_at: new Date().toISOString(),
    });
    return { ok: true, expires_in: 300 };
});
/** auth-2fa-verify-phone — verify phone OTP. */
export const auth2faVerifyPhone = onCall(async (request) => {
    const uid = requireAuth(request);
    const { code: provided } = (request.data || {});
    const ref = db.collection('auth_challenges').doc(`${uid}_phone`);
    const data = (await ref.get()).data();
    if (!data || data.expires_at < Date.now() || data.code_hash !== provided) {
        throw new HttpsError('permission-denied', 'Invalid code');
    }
    await ref.delete();
    await db.collection('profiles').doc(uid).set({ phone_verified: true }, { merge: true });
    return { ok: true };
});
/** phone-verify-request / confirm — send & confirm SMS code (Twilio integration deferred to Phase 6). */
export const phoneVerifyRequest = onCall(async (request) => {
    const uid = requireAuth(request);
    enforceRateLimit(await rateLimit(`phone-req:${uid}`, 3, 600));
    const c = code();
    await db.collection('auth_challenges').doc(`${uid}_phone`).set({
        user_id: uid, code_hash: c, channel: 'sms',
        expires_at: Date.now() + 10 * 60 * 1000, created_at: new Date().toISOString(),
    });
    return { ok: true, dev_code: process.env.NODE_ENV === 'production' ? undefined : c };
});
export const phoneVerifyConfirm = auth2faVerifyPhone;
/** auth-login-approval — approve a pending device login. */
export const authLoginApproval = onCall(async (request) => {
    const uid = requireAuth(request);
    const { sessionId, approve } = (request.data || {});
    if (!sessionId)
        throw new HttpsError('invalid-argument', 'sessionId required');
    await db.collection('auth_challenges').doc(sessionId).set({
        user_id: uid, status: approve ? 'approved' : 'denied', resolved_at: new Date().toISOString(),
    }, { merge: true });
    return { ok: true };
});
/** auth-login-notify — push to existing devices when a new sign-in happens. */
export const authLoginNotify = onCall(async (request) => {
    const uid = requireAuth(request);
    await db.collection('notifications').add({
        user_id: uid, title: 'New sign-in detected', body: 'If this wasn\'t you, secure your account.',
        created_at: new Date().toISOString(), read: false,
    });
    return { ok: true };
});
/** auth-session-revoke — revoke all refresh tokens for the caller. */
export const authSessionRevoke = onCall(async (request) => {
    const uid = requireAuth(request);
    await auth.revokeRefreshTokens(uid);
    return { ok: true };
});
/** auth-qr — issue a short-lived QR pairing token. */
export const authQr = onCall(async (request) => {
    const uid = requireAuth(request);
    const token = `${uid}.${Math.random().toString(36).slice(2)}.${Date.now()}`;
    await db.collection('auth_challenges').doc(`qr_${token}`).set({
        user_id: uid, expires_at: Date.now() + 2 * 60 * 1000, created_at: new Date().toISOString(),
    });
    return { token };
});
/** manage-account — delete or anonymize. */
export const manageAccount = onCall(async (request) => {
    const uid = requireAuth(request);
    const { action } = (request.data || {});
    if (action === 'request_delete') {
        await db.collection('account_deletion_requests').doc(uid).set({
            user_id: uid, status: 'pending', requested_at: new Date().toISOString(),
        });
    }
    else if (action === 'cancel_delete') {
        await db.collection('account_deletion_requests').doc(uid).delete();
    }
    return { ok: true };
});
/** check-premium-subscription — read RevenueCat-mirrored doc or gifted_premium grants. */
export const checkPremiumSubscription = onCall(async (request) => {
    const uid = requireAuth(request);
    const [sub, gifted] = await Promise.all([
        db.collection('subscriptions').doc(uid).get(),
        db.collection('gifted_premium').where('recipient_id', '==', uid).where('active', '==', true).limit(1).get(),
    ]);
    const subData = sub.exists ? sub.data() : null;
    const giftedActive = !gifted.empty;
    const active = giftedActive || (subData?.status === 'active');
    return { active, source: giftedActive ? 'gift' : subData?.source || null, expires_at: subData?.expires_at || null };
});
/** check-debug-secrets / manage-secrets — admin-only stubs (Cloud Functions Secret Manager handles real ops). */
export const checkDebugSecrets = onCall(async (request) => {
    await requireAdmin(request);
    return {
        has_gemini_key: !!process.env.GEMINI_API_KEY,
        has_livekit: !!process.env.LIVEKIT_API_KEY,
        has_stripe: !!process.env.STRIPE_SECRET_KEY,
        has_giphy: !!process.env.GIPHY_API_KEY,
    };
});
export const manageSecrets = onCall(async (request) => {
    await requireAdmin(request);
    throw new HttpsError('unimplemented', 'Secrets are managed via Firebase Secret Manager in the Console / CLI');
});
//# sourceMappingURL=auth.js.map