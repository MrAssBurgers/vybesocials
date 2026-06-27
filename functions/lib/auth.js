import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, auth, requireAuth, requireAdmin, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { sendPasswordResetEmail } from './_shared/passwordResetEmail.js';
import { claimProfileByEmailForUid } from './_shared/claimProfileByEmail.js';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function code() {
    return String(Math.floor(100000 + Math.random() * 900000));
}
/**
 * request-password-reset — branded HTML via Resend (recovery.html) only.
 * Admin generatePasswordResetLink + clean vybehub.app URL; never sendOobCode default mailer.
 */
export const requestPasswordReset = onCall({ cors: true, secrets: ['RESEND_API_KEY', 'EMAIL_FROM'] }, async (request) => {
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
    let provider = 'resend';
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
import { dispatchOneSignalToProfile, resolvePushTargetProfileId } from './_shared/onesignalPush.js';
function asString(value) {
    if (typeof value === 'string' && value.trim())
        return value.trim();
    return undefined;
}
function parseDeviceLabel(userAgent) {
    if (!userAgent)
        return 'Unknown device';
    if (/iphone|ipad|ipod/i.test(userAgent))
        return 'iPhone';
    if (/android/i.test(userAgent))
        return 'Android';
    if (/mac os x/i.test(userAgent))
        return 'Mac';
    if (/windows/i.test(userAgent))
        return 'Windows';
    if (/linux/i.test(userAgent))
        return 'Linux';
    return 'Web browser';
}
async function resolveProfileIdForAuthUid(uid) {
    return resolvePushTargetProfileId(uid);
}
async function loadChallenge(challengeId) {
    const snap = await db.collection('auth_challenges').doc(challengeId).get();
    if (!snap.exists)
        return null;
    return { id: snap.id, ...snap.data() };
}
function challengeExpired(expiresAt) {
    const raw = asString(expiresAt);
    if (!raw)
        return true;
    const ms = Date.parse(raw);
    return !ms || ms <= Date.now();
}
/** auth-login-approval — poll/respond to pending device login (trusted device flow). */
export const authLoginApproval = onCall({ cors: true }, async (request) => {
    const data = (request.data || {});
    const action = asString(data.action) || 'respond';
    if (action === 'poll') {
        const challengeId = asString(data.challengeId);
        if (!challengeId)
            throw new HttpsError('invalid-argument', 'challengeId required');
        const row = await loadChallenge(challengeId);
        if (!row || row.challenge_type !== 'login_approval')
            return { status: 'not_found' };
        if (challengeExpired(row.expires_at))
            return { status: 'expired' };
        const status = asString(row.status) || 'pending';
        if (status === 'approved') {
            const meta = (row.metadata || {});
            const session = meta.pending_session ?? null;
            return { status: 'approved', session };
        }
        if (status === 'denied')
            return { status: 'denied' };
        return { status: 'pending' };
    }
    if (action === 'respond' || action === 'deny_self') {
        const uid = requireAuth(request);
        const challengeId = asString(data.challengeId);
        const intent = action === 'deny_self' ? 'deny' : asString(data.intent);
        if (!challengeId || !intent)
            throw new HttpsError('invalid-argument', 'challengeId and intent required');
        const row = await loadChallenge(challengeId);
        if (!row || row.challenge_type !== 'login_approval') {
            return { error: 'not_found', status: 'not_found' };
        }
        if (row.user_id !== uid)
            throw new HttpsError('permission-denied', 'Not your approval request');
        if (challengeExpired(row.expires_at))
            return { error: 'expired', status: 'expired' };
        if (row.status && row.status !== 'pending')
            return { error: 'already_resolved', status: row.status };
        const now = new Date().toISOString();
        const meta = (row.metadata || {});
        const requestingSessionId = asString(meta.requesting_session_id);
        await db.collection('auth_challenges').doc(challengeId).set({
            status: intent === 'approve' ? 'approved' : 'denied',
            resolved_at: now,
            metadata: { ...meta, resolved_by: uid },
        }, { merge: true });
        if (intent === 'approve' && requestingSessionId) {
            await db.collection('user_sessions').doc(requestingSessionId).set({
                trusted: true,
                last_seen_at: now,
            }, { merge: true });
        }
        return { ok: true, status: intent === 'approve' ? 'approved' : 'denied' };
    }
    throw new HttpsError('invalid-argument', `Unknown action: ${action}`);
});
/**
 * auth-login-notify — register this session; alert OTHER devices only when a new
 * sign-in hits an account that already has active sessions elsewhere.
 */
export const authLoginNotify = onCall({ cors: true, secrets: ['ONESIGNAL_APP_ID', 'ONESIGNAL_REST_API_KEY'] }, async (request) => {
    const uid = requireAuth(request);
    const payload = (request.data || {});
    const sessionHash = asString(payload.deviceFingerprint);
    const method = asString(payload.method) || 'password';
    const userAgent = asString(payload.userAgent);
    const now = new Date().toISOString();
    const profileId = await resolveProfileIdForAuthUid(uid);
    const settingsSnap = await db.collection('user_2fa_settings').doc(uid).get();
    const loginApprovalsEnabled = !!settingsSnap.data()?.login_approvals_enabled;
    // Known session on this device — refresh heartbeat only, no alerts.
    if (sessionHash) {
        const known = await db.collection('user_sessions')
            .where('user_id', '==', uid)
            .where('session_token_hash', '==', sessionHash)
            .limit(1)
            .get();
        if (!known.empty) {
            const doc = known.docs[0];
            await doc.ref.set({ last_seen_at: now }, { merge: true });
            return { ok: true, sessionId: doc.id, notified: false, reason: 'known_session' };
        }
    }
    const sessionRef = db.collection('user_sessions').doc();
    await sessionRef.set({
        user_id: uid,
        session_token_hash: sessionHash || null,
        device_label: parseDeviceLabel(userAgent),
        user_agent: userAgent || null,
        trusted: false,
        created_at: now,
        last_seen_at: now,
        revoked_at: null,
    });
    await db.collection('login_history').add({
        user_id: uid,
        method,
        success: true,
        device_label: parseDeviceLabel(userAgent),
        user_agent: userAgent || null,
        created_at: now,
        metadata: { session_id: sessionRef.id, session_hash: sessionHash || null },
    });
    const allSessions = await db.collection('user_sessions').where('user_id', '==', uid).get();
    const otherActiveSessions = allSessions.docs.filter((doc) => {
        if (doc.id === sessionRef.id)
            return false;
        const revoked = doc.data().revoked_at;
        return !revoked;
    });
    // First device or no other active sessions — never alert yourself on sign-in.
    if (otherActiveSessions.length === 0) {
        await sessionRef.set({ trusted: true }, { merge: true });
        return { ok: true, sessionId: sessionRef.id, notified: false, reason: 'first_device' };
    }
    // Another device is already signed in — only then notify the account owner.
    if (!loginApprovalsEnabled) {
        return { ok: true, sessionId: sessionRef.id, notified: false, reason: 'approvals_disabled' };
    }
    const pendingSnap = await db.collection('auth_challenges')
        .where('user_id', '==', uid)
        .where('challenge_type', '==', 'login_approval')
        .where('status', '==', 'pending')
        .limit(5)
        .get();
    const existing = pendingSnap.docs.find((doc) => {
        const meta = (doc.data().metadata || {});
        return sessionHash && meta.requesting_session_hash === sessionHash;
    });
    if (existing) {
        return {
            ok: true,
            sessionId: sessionRef.id,
            challengeId: existing.id,
            notified: false,
            reason: 'existing_challenge',
        };
    }
    const challengeRef = db.collection('auth_challenges').doc();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await challengeRef.set({
        user_id: uid,
        challenge_type: 'login_approval',
        status: 'pending',
        created_at: now,
        expires_at: expiresAt,
        metadata: {
            requesting_session_hash: sessionHash || null,
            requesting_session_id: sessionRef.id,
            device: { label: parseDeviceLabel(userAgent), browser: userAgent || null },
            method,
        },
    });
    await dispatchOneSignalToProfile(profileId, {
        title: 'Approve sign-in?',
        body: 'Someone is trying to sign in to your VYBE account.',
        type: 'login_approval',
        url: `/?login-approval=${challengeRef.id}`,
        data: {
            challengeId: challengeRef.id,
            challenge_id: challengeRef.id,
        },
    });
    return {
        ok: true,
        sessionId: sessionRef.id,
        challengeId: challengeRef.id,
        notified: true,
        reason: 'approval_push',
    };
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
/** Staff-only Firebase Auth user count (admin analytics). */
export const getAuthUsersCount = onCall({ cors: true }, async (request) => {
    await requireAdmin(request);
    let total = 0;
    let pageToken;
    do {
        const page = await auth.listUsers(1000, pageToken);
        total += page.users.length;
        pageToken = page.pageToken;
    } while (pageToken);
    return total;
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
/** check-debug-secrets — admin-only runtime secret probe (requires secret bindings). */
export const checkDebugSecrets = onCall({
    secrets: [
        'GEMINI_API_KEY',
        'OPENAI_API_KEY',
        'GIPHY_API_KEY',
        'LIVEKIT_API_KEY',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'STRIPE_WEBHOOK_SECRET_THIN',
        'SPOTIFY_CLIENT_ID',
        'SPOTIFY_CLIENT_SECRET',
        'ONESIGNAL_REST_API_KEY',
        'RESEND_API_KEY',
        'PUBLIC_SITE_URL',
    ],
}, async (request) => {
    await requireAdmin(request);
    return {
        has_gemini_key: !!process.env.GEMINI_API_KEY,
        has_openai_key: !!process.env.OPENAI_API_KEY,
        has_giphy: !!process.env.GIPHY_API_KEY,
        has_livekit: !!process.env.LIVEKIT_API_KEY,
        has_stripe: !!process.env.STRIPE_SECRET_KEY,
        has_stripe_webhook: !!process.env.STRIPE_WEBHOOK_SECRET,
        has_stripe_webhook_thin: !!process.env.STRIPE_WEBHOOK_SECRET_THIN,
        has_public_site_url: !!process.env.PUBLIC_SITE_URL,
        has_spotify: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
        has_onesignal: !!process.env.ONESIGNAL_REST_API_KEY,
        has_resend: !!process.env.RESEND_API_KEY,
    };
});
export const manageSecrets = onCall(async (request) => {
    await requireAdmin(request);
    throw new HttpsError('unimplemented', 'Secrets are managed via Firebase Secret Manager in the Console / CLI');
});
//# sourceMappingURL=auth.js.map