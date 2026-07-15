import { randomBytes } from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, auth, requireAuth, requireAdmin, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { sendPasswordResetEmail, type PasswordResetSendProvider } from './_shared/passwordResetEmail.js';
import { claimProfileByEmailForUid } from './_shared/claimProfileByEmail.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function code(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * request-password-reset — branded HTML via Resend (recovery.html) only.
 * Admin generatePasswordResetLink + clean vybehub.app URL; never sendOobCode default mailer.
 */
export const requestPasswordReset = onCall({ cors: true, secrets: ['RESEND_API_KEY', 'EMAIL_FROM'] }, async (request) => {
  const email = String((request.data as { email?: string })?.email || '')
    .trim()
    .toLowerCase();

  if (!email || !EMAIL_REGEX.test(email)) {
    return { ok: true, message: 'If that email exists, we sent a reset link.' };
  }

  enforceRateLimit(await rateLimit(`pwd-reset:${email}`, 3, 3600));

  let displayName: string | undefined;
  try {
    const userRecord = await auth.getUserByEmail(email);
    displayName = userRecord.displayName || undefined;
  } catch {
    return { ok: true, message: 'If that email exists, we sent a reset link.' };
  }

  let provider: PasswordResetSendProvider = 'resend';
  try {
    provider = await sendPasswordResetEmail(email);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
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
  const { code: provided } = (request.data || {}) as { code?: string };
  if (!provided) throw new HttpsError('invalid-argument', 'code required');
  const ref = db.collection('auth_challenges').doc(`${uid}_2fa`);
  const snap = await ref.get();
  const data = snap.data() as any;
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
  const { code: provided, challengeId, phone: clientPhone } = (request.data || {}) as {
    code?: string;
    challengeId?: string;
    phone?: string;
  };
  const challengeDocId = challengeId && String(challengeId).trim()
    ? String(challengeId).trim()
    : `${uid}_phone`;
  const ref = db.collection('auth_challenges').doc(challengeDocId);
  const data = (await ref.get()).data() as {
    expires_at?: number;
    code_hash?: string;
    phone_e164?: string;
    user_id?: string;
  } | undefined;
  if (!data || (data.expires_at ?? 0) < Date.now() || data.code_hash !== provided) {
    throw new HttpsError('permission-denied', 'Invalid code');
  }
  if (data.user_id && data.user_id !== uid) {
    throw new HttpsError('permission-denied', 'Invalid code');
  }
  await ref.delete();

  const phoneE164 = (data.phone_e164 || clientPhone || '').trim();
  const update: Record<string, unknown> = {
    phone_verified: true,
    updated_at: new Date().toISOString(),
  };
  if (phoneE164.startsWith('+')) {
    const { createHash } = await import('crypto');
    update.phone_number = phoneE164;
    update.phone_e164_sha256 = createHash('sha256').update(phoneE164.toLowerCase()).digest('hex');
  }
  await db.collection('profiles').doc(uid).set(update, { merge: true });
  // Also merge when profile id ≠ auth uid
  const byUser = await db.collection('profiles').where('user_id', '==', uid).limit(1).get();
  for (const doc of byUser.docs) {
    if (doc.id !== uid) await doc.ref.set(update, { merge: true });
  }
  return { ok: true, phone: phoneE164 || undefined };
});

/** phone-verify-request / confirm — send & confirm SMS code (Twilio integration deferred to Phase 6). */
export const phoneVerifyRequest = onCall(async (request) => {
  const uid = requireAuth(request);
  enforceRateLimit(await rateLimit(`phone-req:${uid}`, 3, 600));
  const { phone } = (request.data || {}) as { phone?: string };
  const phoneE164 = typeof phone === 'string' ? phone.trim() : '';
  const c = code();
  const challengeId = `${uid}_phone`;
  await db.collection('auth_challenges').doc(challengeId).set({
    user_id: uid,
    code_hash: c,
    channel: 'sms',
    phone_e164: phoneE164.startsWith('+') ? phoneE164 : null,
    expires_at: Date.now() + 10 * 60 * 1000,
    created_at: new Date().toISOString(),
  });
  return {
    ok: true,
    challengeId,
    dev_code: process.env.NODE_ENV === 'production' ? undefined : c,
  };
});

export const phoneVerifyConfirm = auth2faVerifyPhone;

import { dispatchOneSignalToProfile, resolvePushTargetProfileId } from './_shared/onesignalPush.js';

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

function parseDeviceLabel(userAgent?: string): string {
  if (!userAgent) return 'Unknown device';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'iPhone';
  if (/android/i.test(userAgent)) return 'Android';
  if (/mac os x/i.test(userAgent)) return 'Mac';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Web browser';
}

async function resolveProfileIdForAuthUid(uid: string): Promise<string> {
  return resolvePushTargetProfileId(uid);
}

async function loadChallenge(challengeId: string): Promise<Record<string, unknown> | null> {
  const snap = await db.collection('auth_challenges').doc(challengeId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
}

function challengeExpired(expiresAt: unknown): boolean {
  const raw = asString(expiresAt);
  if (!raw) return true;
  const ms = Date.parse(raw);
  return !ms || ms <= Date.now();
}

/** auth-login-approval — poll/respond to pending device login (trusted device flow). */
export const authLoginApproval = onCall({ cors: true }, async (request) => {
  const data = (request.data || {}) as Record<string, unknown>;
  const action = asString(data.action) || 'respond';

  if (action === 'poll') {
    const challengeId = asString(data.challengeId);
    if (!challengeId) throw new HttpsError('invalid-argument', 'challengeId required');
    const row = await loadChallenge(challengeId);
    if (!row || row.challenge_type !== 'login_approval') return { status: 'not_found' };
    if (challengeExpired(row.expires_at)) return { status: 'expired' };
    const status = asString(row.status) || 'pending';
    if (status === 'approved') {
      const meta = (row.metadata || {}) as Record<string, unknown>;
      const session = meta.pending_session ?? null;
      return { status: 'approved', session };
    }
    if (status === 'denied') return { status: 'denied' };
    return { status: 'pending' };
  }

  if (action === 'respond' || action === 'deny_self') {
    const uid = requireAuth(request);
    const challengeId = asString(data.challengeId);
    const intent = action === 'deny_self' ? 'deny' : (asString(data.intent) as 'approve' | 'deny' | undefined);
    if (!challengeId || !intent) throw new HttpsError('invalid-argument', 'challengeId and intent required');

    const row = await loadChallenge(challengeId);
    if (!row || row.challenge_type !== 'login_approval') {
      return { error: 'not_found', status: 'not_found' };
    }
    if (row.user_id !== uid) throw new HttpsError('permission-denied', 'Not your approval request');
    if (challengeExpired(row.expires_at)) return { error: 'expired', status: 'expired' };
    if (row.status && row.status !== 'pending') return { error: 'already_resolved', status: row.status };

    const now = new Date().toISOString();
    const meta = (row.metadata || {}) as Record<string, unknown>;
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
export const authLoginNotify = onCall(
  { cors: true, secrets: ['ONESIGNAL_APP_ID', 'ONESIGNAL_REST_API_KEY'] },
  async (request) => {
    const uid = requireAuth(request);
    const payload = (request.data || {}) as Record<string, unknown>;
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
      if (doc.id === sessionRef.id) return false;
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
      const meta = (doc.data().metadata || {}) as Record<string, unknown>;
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
  },
);

/** auth-session-revoke — revoke all refresh tokens for the caller. */
export const authSessionRevoke = onCall(async (request) => {
  const uid = requireAuth(request);
  await auth.revokeRefreshTokens(uid);
  return { ok: true };
});

const QR_SIGNIN_TTL_SEC = 180;

function qrChallengeDocId(nonce: string): string {
  return `qr_${nonce}`;
}

function isChallengeExpired(expiresAt: unknown): boolean {
  if (typeof expiresAt === 'number') return expiresAt < Date.now();
  if (typeof expiresAt === 'string') {
    const ms = Date.parse(expiresAt);
    return !Number.isFinite(ms) || ms < Date.now();
  }
  return true;
}

/**
 * auth-qr — Quick Sign-In QR pairing.
 * create (public) → poll (public) → claim (signed-in device) → redeem (public → custom token).
 */
export const authQr = onCall({ cors: true }, async (request) => {
  const data = (request.data || {}) as {
    action?: string;
    nonce?: string;
    intent?: 'approve' | 'deny';
  };
  const action = (data.action || 'create').toLowerCase();
  const nonce = typeof data.nonce === 'string' ? data.nonce.trim() : '';

  if (action === 'create') {
    const ip = request.rawRequest?.ip || 'anon';
    enforceRateLimit(await rateLimit(`qr-create:${ip}`, 12, 600));
    const n = randomBytes(18).toString('base64url');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + QR_SIGNIN_TTL_SEC * 1000).toISOString();
    const ua = String(request.rawRequest?.headers?.['user-agent'] || '');
    await db.collection('auth_challenges').doc(qrChallengeDocId(n)).set({
      challenge_type: 'qr_signin',
      nonce: n,
      status: 'pending',
      user_id: null,
      created_at: now,
      expires_at: expiresAt,
      consumed_at: null,
      metadata: {
        device: ua ? ua.slice(0, 120) : 'Unknown device',
        user_agent: ua ? ua.slice(0, 300) : null,
        ip: request.rawRequest?.ip || null,
      },
    });
    return { nonce: n, expiresInSec: QR_SIGNIN_TTL_SEC };
  }

  if (!nonce || nonce.length < 16) {
    throw new HttpsError('invalid-argument', 'nonce required');
  }

  const ref = db.collection('auth_challenges').doc(qrChallengeDocId(nonce));
  const snap = await ref.get();
  if (!snap.exists) {
    return { status: 'not_found' };
  }
  const row = snap.data() as {
    challenge_type?: string;
    status?: string;
    user_id?: string | null;
    expires_at?: string | number;
    consumed_at?: string | null;
    metadata?: Record<string, unknown>;
  };
  if (row.challenge_type && row.challenge_type !== 'qr_signin') {
    return { status: 'not_found' };
  }

  if (isChallengeExpired(row.expires_at)) {
    if (row.status === 'pending') {
      await ref.set({ status: 'expired' }, { merge: true });
    }
    return { status: 'expired', metadata: row.metadata || {} };
  }

  if (action === 'poll') {
    return {
      status: row.status || 'pending',
      metadata: row.metadata || {},
    };
  }

  if (action === 'claim') {
    const uid = requireAuth(request);
    const intent = data.intent;
    if (intent !== 'approve' && intent !== 'deny') {
      throw new HttpsError('invalid-argument', 'intent required');
    }
    // Idempotent: scanning twice / Strict Mode / retries must not fail after first approve.
    if (row.status === 'approved' || row.status === 'redeemed') {
      return { ok: true, status: row.status === 'redeemed' ? 'redeemed' : 'approved' };
    }
    if (row.status === 'denied') {
      return { ok: true, status: 'denied' };
    }
    if (row.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'Challenge is not pending');
    }
    const nextStatus = intent === 'approve' ? 'approved' : 'denied';
    await ref.set({
      status: nextStatus,
      user_id: uid,
      claimed_at: new Date().toISOString(),
    }, { merge: true });
    return { ok: true, status: nextStatus };
  }

  if (action === 'redeem') {
    if (row.status !== 'approved' && row.status !== 'redeemed') {
      throw new HttpsError('failed-precondition', 'Challenge is not approved');
    }
    if (!row.user_id) {
      throw new HttpsError('failed-precondition', 'Missing approving user');
    }
    // Allow one redeem; if already redeemed without token delivery, issue a fresh custom token
    // only when just-approved. Once consumed, still mint token so a flaky client can retry.
    let customToken: string;
    try {
      customToken = await auth.createCustomToken(String(row.user_id), { qr_signin: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[authQr] createCustomToken failed', { uid: row.user_id, msg });
      throw new HttpsError(
        'internal',
        'Could not create sign-in token — check IAM serviceAccountTokenCreator on the function SA',
      );
    }
    if (!row.consumed_at) {
      await ref.set({
        status: 'redeemed',
        consumed_at: new Date().toISOString(),
      }, { merge: true });
    }
    return {
      customToken,
      custom_token: customToken,
      actionLink: null,
    };
  }

  throw new HttpsError('invalid-argument', `Unknown action: ${action}`);
});

/** manage-account — delete or anonymize. */
export const manageAccount = onCall(async (request) => {
  const uid = requireAuth(request);
  const { action } = (request.data || {}) as { action?: 'request_delete' | 'cancel_delete' };
  if (action === 'request_delete') {
    await db.collection('account_deletion_requests').doc(uid).set({
      user_id: uid, status: 'pending', requested_at: new Date().toISOString(),
    });
  } else if (action === 'cancel_delete') {
    await db.collection('account_deletion_requests').doc(uid).delete();
  }
  return { ok: true };
});

/** Staff-only Firebase Auth user count (admin analytics). */
export const getAuthUsersCount = onCall({ cors: true }, async (request) => {
  await requireAdmin(request);
  let total = 0;
  let pageToken: string | undefined;
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
  const subData = sub.exists ? (sub.data() as any) : null;
  const giftedActive = !gifted.empty;
  const active = giftedActive || (subData?.status === 'active');
  return { active, source: giftedActive ? 'gift' : subData?.source || null, expires_at: subData?.expires_at || null };
});

/** check-debug-secrets — admin-only runtime secret probe (requires secret bindings). */
export const checkDebugSecrets = onCall(
  {
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
  },
  async (request) => {
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
  },
);

export const manageSecrets = onCall(async (request) => {
  await requireAdmin(request);
  throw new HttpsError('unimplemented', 'Secrets are managed via Firebase Secret Manager in the Console / CLI');
});
