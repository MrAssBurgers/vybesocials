import { TWILIO_SECRETS, getTwilioConfig, twilioVerifyStart, twilioVerifyCheck } from './_shared/twilioVerify.js';
import { verifiedAuthPhone } from './_shared/phoneVerificationAuthority.js';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import type { DocumentReference } from 'firebase-admin/firestore';
import { OAuth2Client } from 'google-auth-library';
import { db, auth, requireAuth, requireAdmin, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { sendPasswordResetEmail, type PasswordResetSendProvider } from './_shared/passwordResetEmail.js';
import { claimProfileByEmailForUid } from './_shared/claimProfileByEmail.js';
import { gateKnownSession, shouldExpireStaleLoginChallenge } from './_shared/loginNotifyGuards.js';
import { renderAuthEmail, AUTH_EMAIL_SUBJECTS } from './_shared/emailTemplates/index.js';
import { premiumStatusForRequest } from './_shared/premiumAuthority.js';

/** Must match Firebase Console Google web client (public). Used by native-callback exchange. */
const GOOGLE_WEB_CLIENT_ID =
  '728651793473-71p1iahdr79ali0o7en8ktirklfjf3pf.apps.googleusercontent.com';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_URL = 'https://api.resend.com/emails';

function code(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function fromAddr(): string {
  return process.env.EMAIL_FROM || 'VYBE <no-reply@vybehub.app>';
}

async function sendCodeEmail(to: string, otp: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.error('[auth2fa] RESEND_API_KEY not bound');
    return false;
  }
  const html = renderAuthEmail('reauthentication', { email: to, code: otp, link: otp });
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromAddr(),
      to: [to],
      subject: AUTH_EMAIL_SUBJECTS.reauthentication,
      html,
    }),
  });
  if (!res.ok) {
    console.error('[auth2fa] Resend failed:', res.status, (await res.text()).slice(0, 200));
    return false;
  }
  return true;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

function hashOtp(otp: string, salt: string): string {
  return createHmac('sha256', salt).update(otp).digest('hex');
}

function otpMatches(provided: string, codeHash: string, codeSalt: string): boolean {
  const expected = Buffer.from(codeHash, 'hex');
  const actual = Buffer.from(hashOtp(String(provided).trim(), codeSalt), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
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
export const auth2faRequest = onCall(
  { cors: true, secrets: ['RESEND_API_KEY', 'EMAIL_FROM'] },
  async (request) => {
    const payload = (request.data || {}) as { challengeId?: string; email?: string };
    const existingChallengeId = asString(payload.challengeId);
    const uid = request.auth?.uid;

    // Soft-signed-out resend: refresh code on an existing challenge by id.
    if (!uid && existingChallengeId) {
      enforceRateLimit(await rateLimit(`2fa-req-anon:${existingChallengeId}`, 5, 600));
      const ref = db.collection('auth_challenges').doc(existingChallengeId);
      const snap = await ref.get();
      const data = snap.data() as {
        user_id?: string;
        challenge_type?: string;
        expires_at?: number | string;
        email?: string;
        metadata?: Record<string, unknown>;
      } | undefined;
      if (!data?.user_id) throw new HttpsError('not-found', 'Challenge not found');
      const type = data.challenge_type || 'email_2fa';
      if (type !== 'email_2fa' && type !== 'login_approval') {
        throw new HttpsError('failed-precondition', 'Unsupported challenge');
      }
      const challengeUid = String(data.user_id);
      let email = asString(data.email);
      if (!email) {
        try {
          email = (await auth.getUser(challengeUid)).email || undefined;
        } catch {
          email = undefined;
        }
      }
      if (!email) throw new HttpsError('failed-precondition', 'No email on account');

      const c = code();
      const salt = randomBytes(16).toString('hex');
      const expiresAtMs = Date.now() + 10 * 60 * 1000;
      const expiresAtIso = new Date(expiresAtMs).toISOString();
      await ref.set({
        code_hash: hashOtp(c, salt),
        code_salt: salt,
        channel: 'email',
        email,
        expires_at: type === 'login_approval' ? expiresAtIso : expiresAtMs,
        updated_at: new Date().toISOString(),
        metadata: {
          ...(data.metadata || {}),
          code_hash: hashOtp(c, salt),
          code_salt: salt,
          code_channel: 'email',
        },
      }, { merge: true });

      const sent = await sendCodeEmail(email, c);
      if (!sent) throw new HttpsError('internal', 'Failed to send verification email');
      return { ok: true, challengeId: existingChallengeId, expiresAt: expiresAtIso, email: maskEmail(email) };
    }

    const authedUid = requireAuth(request);
    enforceRateLimit(await rateLimit(`2fa-req:${authedUid}`, 5, 600));

    let email: string | undefined;
    try {
      email = (await auth.getUser(authedUid)).email || undefined;
    } catch {
      email = undefined;
    }
    if (!email) throw new HttpsError('failed-precondition', 'No email on account');

    const c = code();
    const salt = randomBytes(16).toString('hex');
    const expiresAtMs = Date.now() + 10 * 60 * 1000;
    const expiresAtIso = new Date(expiresAtMs).toISOString();
    // Random id — never `${uid}_2fa` (predictable and unsafe for unauth verify).
    const ref = existingChallengeId
      ? db.collection('auth_challenges').doc(existingChallengeId)
      : db.collection('auth_challenges').doc();
    await ref.set({
      user_id: authedUid,
      challenge_type: 'email_2fa',
      code_hash: hashOtp(c, salt),
      code_salt: salt,
      channel: 'email',
      email,
      status: 'pending',
      expires_at: expiresAtMs,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { merge: true });

    const sent = await sendCodeEmail(email, c);
    if (!sent) throw new HttpsError('internal', 'Failed to send verification email');
    return { ok: true, challengeId: ref.id, expiresAt: expiresAtIso, email: maskEmail(email) };
  },
);

/** auth-2fa-verify — confirm a 6-digit code; mint custom token when soft-signed-out. */
export const auth2faVerify = onCall({ cors: true }, async (request) => {
  const payload = (request.data || {}) as { code?: string; challengeId?: string };
  const provided = asString(payload.code);
  const challengeId = asString(payload.challengeId);
  if (!provided) throw new HttpsError('invalid-argument', 'code required');

  const uid = request.auth?.uid;
  enforceRateLimit(await rateLimit(`2fa-verify:${challengeId || uid || 'anon'}`, 10, 600));

  const ref = challengeId
    ? db.collection('auth_challenges').doc(challengeId)
    : uid
      ? db.collection('auth_challenges').doc(`${uid}_2fa`)
      : null;
  if (!ref) throw new HttpsError('unauthenticated', 'Sign in or provide challengeId');

  const snap = await ref.get();
  const data = snap.data() as {
    user_id?: string;
    expires_at?: number | string;
    code_hash?: string;
    code_salt?: string;
    challenge_type?: string;
    status?: string;
    metadata?: Record<string, unknown>;
  } | undefined;

  const meta = (data?.metadata || {}) as Record<string, unknown>;
  const codeHash = data?.code_hash || asString(meta.code_hash);
  const codeSalt = data?.code_salt || asString(meta.code_salt);
  const challengeUid = asString(data?.user_id);
  if (!data || !codeHash || !codeSalt || !challengeUid) {
    throw new HttpsError('permission-denied', 'Invalid or expired code');
  }

  const expiresRaw = data.expires_at;
  const expiresMs = typeof expiresRaw === 'number'
    ? expiresRaw
    : typeof expiresRaw === 'string'
      ? Date.parse(expiresRaw)
      : 0;
  if (!expiresMs || expiresMs < Date.now()) {
    throw new HttpsError('permission-denied', 'Invalid or expired code');
  }
  if (data.status && data.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'Challenge already resolved');
  }
  if (uid && uid !== challengeUid) {
    throw new HttpsError('permission-denied', 'Not your challenge');
  }
  if (!otpMatches(provided, codeHash, codeSalt)) {
    throw new HttpsError('permission-denied', 'Invalid or expired code');
  }

  const now = new Date().toISOString();
  if (data.challenge_type === 'login_approval') {
    let customToken: string;
    try {
      customToken = await auth.createCustomToken(challengeUid, { email_2fa: challengeId });
    } catch (err) {
      console.error('[auth2faVerify] createCustomToken failed', err);
      throw new HttpsError('internal', 'Could not mint session token');
    }
    await ref.set({
      status: 'approved',
      resolved_at: now,
      metadata: {
        ...meta,
        resolved_by: 'email_code',
        custom_token: customToken,
        code_hash: FieldValue.delete(),
        code_salt: FieldValue.delete(),
      },
    }, { merge: true });
    return { ok: true, customToken, status: 'approved' };
  }

  await ref.delete().catch(async () => {
    await ref.set({ status: 'approved', resolved_at: now }, { merge: true });
  });
  await db.collection('profiles').doc(challengeUid).set(
    { two_factor_verified_at: now },
    { merge: true },
  ).catch(() => undefined);

  if (!uid) {
    let customToken: string;
    try {
      customToken = await auth.createCustomToken(challengeUid, { email_2fa: true });
    } catch (err) {
      console.error('[auth2faVerify] createCustomToken failed', err);
      throw new HttpsError('internal', 'Could not mint session token');
    }
    return { ok: true, customToken };
  }

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

function maskPhone(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `•••${digits.slice(-4)}`;
}

async function resolveVerifiedPhoneForUid(uid: string): Promise<string | null> {
  try { return verifiedAuthPhone(await auth.getUser(uid)); }
  catch (error) {
    if ((error as { code?: string })?.code === 'auth/user-not-found') return null;
    throw new HttpsError('unavailable', 'Phone verification is unavailable. Please retry.');
  }
}

/** auth-2fa-verify-phone — verify phone OTP (Twilio Verify when configured). */
export const auth2faVerifyPhone = onCall(
  { cors: true, secrets: [...TWILIO_SECRETS] },
  async (request) => {
  const payload = (request.data || {}) as {
    code?: string;
    challengeId?: string;
    phone?: string;
  };
  const provided = asString(payload.code);
  const challengeId = asString(payload.challengeId);
  const uid = request.auth?.uid;

  if (!provided || !/^\d{6}$/.test(provided)) {
    throw new HttpsError('invalid-argument', 'code required');
  }

  const challengeDocId = challengeId
    || (uid ? `${uid}_phone` : null);
  if (!challengeDocId) {
    throw new HttpsError('unauthenticated', 'Sign in or provide challengeId');
  }

  if (!/^[A-Za-z0-9_-]{1,160}$/.test(challengeDocId)) throw new HttpsError('invalid-argument', 'Invalid challenge.');
  const ref = db.collection('auth_challenges').doc(challengeDocId);
  const data = (await ref.get()).data() as {
    expires_at?: number | string;
    code_hash?: string;
    channel?: string;
    phone_e164?: string;
    user_id?: string;
    provider?: string;
    challenge_type?: string;
    status?: string;
    metadata?: Record<string, unknown>;
  } | undefined;
  if (!data) {
    throw new HttpsError('permission-denied', 'Invalid code');
  }

  const challengeUid = asString(data.user_id);
  if (uid && challengeUid && challengeUid !== uid) {
    throw new HttpsError('permission-denied', 'Invalid code');
  }

  const expiresRaw = data.expires_at;
  const expiresMs = typeof expiresRaw === 'number'
    ? expiresRaw
    : typeof expiresRaw === 'string'
      ? Date.parse(expiresRaw)
      : 0;
  if (!expiresMs || expiresMs < Date.now()) {
    throw new HttpsError('permission-denied', 'Invalid code');
  }
  if (data.status && data.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'Challenge already resolved');
  }

  enforceRateLimit(await rateLimit(`2fa-phone-verify:${challengeDocId}`, 10, 600));

  const meta = (data.metadata || {}) as Record<string, unknown>;
  const phoneE164 = (
    asString(data.phone_e164) ||
    asString(meta.phone_e164) ||
    ''
  ).trim();
  const twilio = getTwilioConfig();
  const provider = data.provider || asString(meta.sms_provider);

  if (!challengeUid || data.challenge_type !== 'login_approval' || data.status !== 'pending'
    || data.channel !== 'sms' || provider !== 'twilio_verify' || meta.switched_to !== 'sms_code'
    || await resolveVerifiedPhoneForUid(challengeUid) !== phoneE164) {
    throw new HttpsError('permission-denied', 'This SMS login request is no longer valid.');
  }
  if (!twilio) throw new HttpsError('failed-precondition', 'SMS verification is unavailable.');
  const check = await twilioVerifyCheck(twilio, phoneE164, provided);
  if (!check.ok) throw new HttpsError('permission-denied', 'Incorrect code.');
  if (await resolveVerifiedPhoneForUid(challengeUid) !== phoneE164) throw new HttpsError('permission-denied', 'Your verified phone changed. Start sign-in again.');

  const now = new Date().toISOString();
  const isLoginGate =
    data.challenge_type === 'login_approval' ||
    asString(meta.switched_to) === 'sms_code';

  if (isLoginGate && challengeUid) {
    let customToken: string;
    try {
      customToken = await auth.createCustomToken(challengeUid, { sms_2fa: challengeDocId });
    } catch (err) {
      console.error('[auth2faVerifyPhone] createCustomToken failed', err);
      throw new HttpsError('internal', 'Could not mint session token');
    }
    await db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (!current || current.user_id !== challengeUid || current.challenge_type !== 'login_approval'
        || current.status !== 'pending' || current.provider !== 'twilio_verify' || current.channel !== 'sms'
        || current.metadata?.switched_to !== 'sms_code'
        || current.phone_e164 !== phoneE164 || current.expires_at !== data.expires_at
        || challengeExpired(current.expires_at)) throw new HttpsError('permission-denied', 'This SMS login request is no longer valid.');
      tx.update(ref, { status: 'approved', resolved_at: now,
        metadata: { ...current.metadata, resolved_by: 'sms_code', custom_token: customToken } });
    });
    return { ok: true, customToken, status: 'approved', phone: phoneE164 || undefined };
  }

  throw new HttpsError('failed-precondition', 'Open phone settings to verify a phone number.');
});



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
  const ms = typeof expiresAt === 'number' ? expiresAt : typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN;
  return !Number.isFinite(ms) || ms <= Date.now();
}

/** auth-login-approval — poll/respond to pending device login (trusted device flow). */
export const authLoginApproval = onCall(
  { cors: true, secrets: ['RESEND_API_KEY', 'EMAIL_FROM', ...TWILIO_SECRETS] },
  async (request) => {
  const data = (request.data || {}) as Record<string, unknown>;
  const action = asString(data.action) || 'respond';

  if (action === 'poll') {
    const challengeId = asString(data.challengeId);
    if (!challengeId) throw new HttpsError('invalid-argument', 'challengeId required');
    const row = await loadChallenge(challengeId);
    if (!row || row.challenge_type !== 'login_approval') return { status: 'not_found' };
    if (challengeExpired(row.expires_at)) {
      if ((asString(row.status) || 'pending') === 'pending') {
        await db.collection('auth_challenges').doc(challengeId).set({
          status: 'expired',
          resolved_at: new Date().toISOString(),
        }, { merge: true });
      }
      return { status: 'expired' };
    }
    const status = asString(row.status) || 'pending';
    if (status === 'approved') {
      const meta = (row.metadata || {}) as Record<string, unknown>;
      const customToken = asString(meta.custom_token) || null;
      const session = meta.pending_session ?? null;
      // One-time redeem — scrub token after first successful poll so it cannot be replayed.
      if (customToken) {
        await db.collection('auth_challenges').doc(challengeId).update({
          'metadata.custom_token': FieldValue.delete(),
          'metadata.custom_token_redeemed_at': new Date().toISOString(),
        });
      }
      return { status: 'approved', customToken, session };
    }
    if (status === 'denied') return { status: 'denied' };
    return { status: 'pending', expiresAt: row.expires_at };
  }

  if (action === 'respond' || action === 'deny_self') {
    const challengeId = asString(data.challengeId);
    const intent = action === 'deny_self' ? 'deny' : (asString(data.intent) as 'approve' | 'deny' | undefined);
    if (!challengeId || !intent) throw new HttpsError('invalid-argument', 'challengeId and intent required');

    const row = await loadChallenge(challengeId);
    if (!row || row.challenge_type !== 'login_approval') {
      return { error: 'not_found', status: 'not_found' };
    }
    if (challengeExpired(row.expires_at)) return { error: 'expired', status: 'expired' };
    if (row.status && row.status !== 'pending') return { error: 'already_resolved', status: row.status };

    const meta = (row.metadata || {}) as Record<string, unknown>;
    const requestingSessionId = asString(meta.requesting_session_id);
    const now = new Date().toISOString();
    const challengeUid = asString(row.user_id);

    // deny_self: attempting device cancels before/after soft sign-out (may be unauthenticated).
    if (action === 'deny_self') {
      await db.collection('auth_challenges').doc(challengeId).set({
        status: 'denied',
        resolved_at: now,
        metadata: { ...meta, resolved_by: 'self', resolve_reason: 'deny_self' },
      }, { merge: true });
      if (requestingSessionId) {
        await db.collection('user_sessions').doc(requestingSessionId).set({
          revoked_at: now,
          trusted: false,
        }, { merge: true });
      }
      return { ok: true, status: 'denied' };
    }

    // Approve / deny from an already-logged-in owner session only.
    const uid = requireAuth(request);
    if (!challengeUid || row.user_id !== uid) {
      throw new HttpsError('permission-denied', 'Not your approval request');
    }

    // Approver must have a different active session than the one requesting login.
    const sessionsSnap = await db.collection('user_sessions').where('user_id', '==', uid).get();
    const approverSessions = sessionsSnap.docs.filter((doc) => {
      if (requestingSessionId && doc.id === requestingSessionId) return false;
      return !doc.data().revoked_at;
    });
    if (approverSessions.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'No trusted session available to approve this sign-in',
      );
    }

    if (intent === 'approve') {
      let customToken: string;
      try {
        customToken = await auth.createCustomToken(uid, {
          login_approval: challengeId,
        });
      } catch (err) {
        console.error('[authLoginApproval] createCustomToken failed', err);
        throw new HttpsError('internal', 'Could not mint approval token');
      }

      await db.collection('auth_challenges').doc(challengeId).set({
        status: 'approved',
        resolved_at: now,
        metadata: {
          ...meta,
          resolved_by: uid,
          custom_token: customToken,
        },
      }, { merge: true });

      if (requestingSessionId) {
        await db.collection('user_sessions').doc(requestingSessionId).set({
          trusted: true,
          pending_approval: false,
          last_seen_at: now,
          revoked_at: null,
        }, { merge: true });
      }

      return { ok: true, status: 'approved' };
    }

    await db.collection('auth_challenges').doc(challengeId).set({
      status: 'denied',
      resolved_at: now,
      metadata: { ...meta, resolved_by: uid },
    }, { merge: true });

    if (requestingSessionId) {
      await db.collection('user_sessions').doc(requestingSessionId).set({
        revoked_at: now,
        trusted: false,
        pending_approval: false,
      }, { merge: true });
    }

    return { ok: true, status: 'denied' };
  }

  // Fallback: trusted device unreachable → email a 6-digit code on this challenge.
  if (action === 'switch_to_code') {
    const challengeId = asString(data.challengeId);
    if (!challengeId) throw new HttpsError('invalid-argument', 'challengeId required');
    enforceRateLimit(await rateLimit(`login-switch-code:${challengeId}`, 5, 600));

    const row = await loadChallenge(challengeId);
    if (!row || row.challenge_type !== 'login_approval') {
      return { ok: false, error: 'not_found' };
    }
    if (challengeExpired(row.expires_at)) return { ok: false, error: 'expired' };
    if (row.status && row.status !== 'pending') return { ok: false, error: 'already_resolved' };

    const challengeUid = asString(row.user_id);
    if (!challengeUid) return { ok: false, error: 'no_session' };

    let email: string | undefined;
    try {
      email = (await auth.getUser(challengeUid)).email || undefined;
    } catch {
      email = undefined;
    }
    if (!email) return { ok: false, error: 'email_failed' };

    const c = code();
    const salt = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const meta = (row.metadata || {}) as Record<string, unknown>;
    await db.collection('auth_challenges').doc(challengeId).set({
      expires_at: expiresAt,
      channel: 'email',
      email,
      code_hash: hashOtp(c, salt),
      code_salt: salt,
      metadata: {
        ...meta,
        code_hash: hashOtp(c, salt),
        code_salt: salt,
        code_channel: 'email',
        switched_to: 'email_code',
      },
    }, { merge: true });

    const sent = await sendCodeEmail(email, c);
    if (!sent) return { ok: false, error: 'email_failed' };

    return {
      ok: true,
      challengeId,
      expiresAt,
      email: maskEmail(email),
      mode: 'code',
    };
  }

  if (action === 'switch_to_sms') {
    const challengeId = asString(data.challengeId);
    if (!challengeId) throw new HttpsError('invalid-argument', 'challengeId required');
    enforceRateLimit(await rateLimit(`login-switch-sms:${challengeId}`, 3, 600));

    const row = await loadChallenge(challengeId);
    if (!row || row.challenge_type !== 'login_approval') {
      return { ok: false, error: 'not_found' };
    }
    if (challengeExpired(row.expires_at)) return { ok: false, error: 'expired' };
    if (row.status && row.status !== 'pending') return { ok: false, error: 'already_resolved' };

    const challengeUid = asString(row.user_id);
    if (!challengeUid) return { ok: false, error: 'no_session' };

    const phoneE164 = await resolveVerifiedPhoneForUid(challengeUid);
    if (!phoneE164) return { ok: false, error: 'no_verified_phone' };

    const twilio = getTwilioConfig();
    if (!twilio) return { ok: false, error: 'twilio_not_configured' };

    const started = await twilioVerifyStart(twilio, phoneE164);
    if (!started.ok) {
      return { ok: false, error: started.error || 'sms_send_failed', detail: started.detail };
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const meta = (row.metadata || {}) as Record<string, unknown>;
    await db.collection('auth_challenges').doc(challengeId).set({
      expires_at: expiresAt,
      channel: 'sms',
      provider: 'twilio_verify',
      phone_e164: phoneE164,
      metadata: {
        ...meta,
        phone_e164: phoneE164,
        sms_provider: 'twilio_verify',
        code_channel: 'sms',
        switched_to: 'sms_code',
      },
    }, { merge: true });

    return {
      ok: true,
      challengeId,
      expiresAt,
      phoneMasked: maskPhone(phoneE164),
      mode: 'sms',
    };
  }

  throw new HttpsError('invalid-argument', `Unknown action: ${action}`);
});

function clientIpFromRequest(request: { rawRequest?: { ip?: string; headers?: Record<string, unknown> } }): string | null {
  const headers = request.rawRequest?.headers || {};
  const xf = headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
  if (Array.isArray(xf) && typeof xf[0] === 'string') return xf[0].split(',')[0].trim();
  const appEngine = headers['x-appengine-user-ip'];
  if (typeof appEngine === 'string' && appEngine.trim()) return appEngine.trim();
  return request.rawRequest?.ip || null;
}

async function resolveLoginGeo(
  request: { rawRequest?: { ip?: string; headers?: Record<string, unknown> } },
): Promise<{ ip: string | null; city?: string; region?: string; country?: string; latitude?: number; longitude?: number }> {
  const headers = request.rawRequest?.headers || {};
  const ip = clientIpFromRequest(request);
  const countryHeader =
    (typeof headers['x-appengine-country'] === 'string' && headers['x-appengine-country']) ||
    (typeof headers['cf-ipcountry'] === 'string' && headers['cf-ipcountry']) ||
    null;
  const base: { ip: string | null; city?: string; region?: string; country?: string; latitude?: number; longitude?: number } = {
    ip,
    country: countryHeader && countryHeader !== 'ZZ' ? countryHeader : undefined,
  };
  if (!ip || ip === '127.0.0.1' || ip.startsWith('::')) return base;
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return base;
    const j = (await res.json()) as {
      city?: string;
      region?: string;
      country_name?: string;
      country?: string;
      latitude?: number;
      longitude?: number;
      lat?: number;
      lon?: number;
      error?: boolean;
    };
    if (j?.error) return base;
    return {
      ip,
      city: j.city || undefined,
      region: j.region || undefined,
      country: j.country_name || j.country || base.country,
      latitude:
        typeof j.latitude === 'number' ? j.latitude : typeof j.lat === 'number' ? j.lat : undefined,
      longitude:
        typeof j.longitude === 'number' ? j.longitude : typeof j.lon === 'number' ? j.lon : undefined,
    };
  } catch {
    return base;
  }
}

/**
 * auth-login-notify — register this session; alert OTHER devices only when a new
 * sign-in hits an account that already has active sessions elsewhere.
 * `session_resume` / app opens never create approval challenges.
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
    const isResume = method === 'session_resume' || method === 'app_open' || method === 'heartbeat';

    const profileId = await resolveProfileIdForAuthUid(uid);
    const settingsSnap = await db.collection('user_2fa_settings').doc(uid).get();
    const loginApprovalsEnabled = !!settingsSnap.data()?.login_approvals_enabled;

    const geo = await resolveLoginGeo(request);
    // Firestore rejects nested undefined values. Geo lookup is intentionally
    // best-effort, so persist an explicit nullable shape on every path.
    const safeGeo = {
      ip: geo.ip ?? null,
      city: geo.city ?? null,
      region: geo.region ?? null,
      country: geo.country ?? null,
      latitude: geo.latitude ?? null,
      longitude: geo.longitude ?? null,
    };

    let sessionRef: DocumentReference | null = null;

    // Known session on this device. Trusted installs may heartbeat normally,
    // but an untrusted install with pending approval must stay gated on retry.
    if (sessionHash) {
      const known = await db.collection('user_sessions')
        .where('user_id', '==', uid)
        .where('session_token_hash', '==', sessionHash)
        .limit(1)
        .get();
      if (!known.empty) {
        const doc = known.docs[0];
        const sessionData = doc.data() as Record<string, unknown>;
        const pendingApproval = sessionData.pending_approval === true;
        const trusted = sessionData.trusted !== false;
        const deviceLabel = parseDeviceLabel(userAgent);

        await doc.ref.set({
          last_seen_at: now,
          ip: geo.ip ?? null,
          city: geo.city ?? null,
          region: geo.region ?? null,
          country: geo.country ?? null,
          latitude: geo.latitude ?? null,
          longitude: geo.longitude ?? null,
          geo: safeGeo,
        }, { merge: true });

        const gate = gateKnownSession({ pendingApproval, trusted, isResume });
        if (gate.action === 'require_approval') {
          const pendingSnap = await db.collection('auth_challenges')
            .where('user_id', '==', uid)
            .where('challenge_type', '==', 'login_approval')
            .where('status', '==', 'pending')
            .limit(10)
            .get();
          const existing = pendingSnap.docs.find((challenge) => {
            const meta = (challenge.data().metadata || {}) as Record<string, unknown>;
            return (
              meta.requesting_session_id === doc.id ||
              (sessionHash && meta.requesting_session_hash === sessionHash)
            );
          });
          await doc.ref.set({ trusted: false, pending_approval: true }, { merge: true });
          if (existing) {
            const existingData = existing.data();
            return {
              ok: true,
              sessionId: doc.id,
              challengeId: existing.id,
              expiresAt: existingData.expires_at || null,
              deviceLabel,
              geo: {
                city: geo.city || null,
                country: geo.country || null,
                ip: geo.ip,
                region: geo.region || null,
              },
              notified: false,
              requiresApproval: true,
              reason: 'existing_challenge',
            };
          }
          sessionRef = doc.ref;
        } else {
          const stale = await db.collection('auth_challenges')
            .where('user_id', '==', uid)
            .where('challenge_type', '==', 'login_approval')
            .where('status', '==', 'pending')
            .limit(10)
            .get();
          const batch = db.batch();
          let cleared = 0;
          for (const challenge of stale.docs) {
            const meta = (challenge.data().metadata || {}) as Record<string, unknown>;
            const sameDevice = meta.requesting_session_hash === sessionHash;
            const resumeNoise = meta.method === 'session_resume' || meta.method === 'app_open';
            if (shouldExpireStaleLoginChallenge({ trusted, sameDevice, resumeNoise })) {
              batch.set(challenge.ref, { status: 'expired', resolved_at: now }, { merge: true });
              cleared += 1;
            }
          }
          if (cleared > 0) await batch.commit();
          return {
            ok: true,
            sessionId: doc.id,
            notified: false,
            requiresApproval: false,
            reason: 'known_session',
          };
        }
      }
    }

    let reusedPendingSession = false;
    if (!sessionRef) {
      sessionRef = db.collection('user_sessions').doc();
      const deviceLabel = parseDeviceLabel(userAgent);
      await sessionRef.set({
        user_id: uid,
        session_token_hash: sessionHash || null,
        device_label: deviceLabel,
        user_agent: userAgent || null,
        ip: geo.ip ?? null,
        city: geo.city ?? null,
        region: geo.region ?? null,
        country: geo.country ?? null,
        latitude: geo.latitude ?? null,
        longitude: geo.longitude ?? null,
        geo: safeGeo,
        trusted: isResume,
        pending_approval: false,
        created_at: now,
        last_seen_at: now,
        revoked_at: null,
      });
    } else {
      reusedPendingSession = true;
    }

    const deviceLabel = parseDeviceLabel(userAgent);

    // Cold starts / resumes register the install but never spam approvals or history.
    if (isResume) {
      return {
        ok: true,
        sessionId: sessionRef.id,
        notified: false,
        requiresApproval: false,
        reason: 'session_resume',
      };
    }

    if (!reusedPendingSession) {
      await db.collection('login_history').add({
        user_id: uid,
        method,
        success: true,
        device_label: deviceLabel,
        user_agent: userAgent || null,
        created_at: now,
        metadata: {
          session_id: sessionRef.id,
          session_hash: sessionHash || null,
          ip: geo.ip ?? null,
          geo: safeGeo,
        },
      });
    }

    const allSessions = await db.collection('user_sessions').where('user_id', '==', uid).get();
    const otherActiveSessions = allSessions.docs.filter((doc) => {
      if (doc.id === sessionRef.id) return false;
      const revoked = doc.data().revoked_at;
      return !revoked;
    });

    // First device or no other active sessions — never alert yourself on sign-in.
    if (otherActiveSessions.length === 0) {
      await sessionRef.set({ trusted: true, pending_approval: false }, { merge: true });
      return {
        ok: true,
        sessionId: sessionRef.id,
        notified: false,
        requiresApproval: false,
        reason: 'first_device',
      };
    }

    // Another device is already signed in — only then notify the account owner.
    // Treat enable-toggle as a heartbeat that trusts this device without gating.
    if (method === 'login_approval_enable') {
      await sessionRef.set({ trusted: true, pending_approval: false }, { merge: true });
      return {
        ok: true,
        sessionId: sessionRef.id,
        notified: false,
        requiresApproval: false,
        reason: 'login_approval_enable',
      };
    }

    if (!loginApprovalsEnabled) {
      await sessionRef.set({ trusted: true, pending_approval: false }, { merge: true });
      return {
        ok: true,
        sessionId: sessionRef.id,
        notified: false,
        requiresApproval: false,
        reason: 'approvals_disabled',
      };
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
      const existingData = existing.data();
      await sessionRef.set({ trusted: false, pending_approval: true }, { merge: true });
      return {
        ok: true,
        sessionId: sessionRef.id,
        challengeId: existing.id,
        expiresAt: existingData.expires_at || null,
        deviceLabel,
        geo: { city: geo.city || null, country: geo.country || null, ip: geo.ip, region: geo.region || null },
        notified: false,
        requiresApproval: true,
        reason: 'existing_challenge',
      };
    }

    const challengeRef = db.collection('auth_challenges').doc();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const place = [geo.city, geo.region, geo.country].filter(Boolean).join(', ') || geo.ip || 'Unknown location';
    await challengeRef.set({
      user_id: uid,
      challenge_type: 'login_approval',
      status: 'pending',
      created_at: now,
      expires_at: expiresAt,
      metadata: {
        requesting_session_hash: sessionHash || null,
        requesting_session_id: sessionRef.id,
        device: { label: deviceLabel, browser: userAgent || null, os: deviceLabel },
        method,
        ip: geo.ip ?? null,
        geo: safeGeo,
      },
    });

    await sessionRef.set({ trusted: false, pending_approval: true }, { merge: true });

    // In-app notification so the already-signed-in session sees a pop + inbox row
    // even when OneSignal delivery is delayed/offline.
    try {
      const notifId = `login_approval_${challengeRef.id}`;
      await db.collection('notifications').doc(notifId).set({
        id: notifId,
        user_id: profileId,
        type: 'login_approval',
        title: 'Approve sign-in?',
        body: `New sign-in from ${place}. Was this you?`,
        actor_id: null,
        read: false,
        created_at: now,
        deep_link: `/?login-approval=${challengeRef.id}`,
        metadata: {
          challenge_id: challengeRef.id,
          challengeId: challengeRef.id,
          device_label: deviceLabel,
          geo: safeGeo,
        },
      }, { merge: true });
      // Also address by auth uid when profile id differs (legacy rows).
      if (profileId !== uid) {
        await db.collection('notifications').doc(`${notifId}_${uid}`).set({
          id: `${notifId}_${uid}`,
          user_id: uid,
          type: 'login_approval',
          title: 'Approve sign-in?',
          body: `New sign-in from ${place}. Was this you?`,
          actor_id: null,
          read: false,
          created_at: now,
          deep_link: `/?login-approval=${challengeRef.id}`,
          metadata: {
            challenge_id: challengeRef.id,
            challengeId: challengeRef.id,
            device_label: deviceLabel,
            geo: safeGeo,
          },
        }, { merge: true });
      }
    } catch (err) {
      console.warn('[authLoginNotify] in-app notification failed', err);
    }

    await dispatchOneSignalToProfile(profileId, {
      title: 'Approve sign-in?',
      body: `New sign-in from ${place}. Was this you?`,
      type: 'login_approval',
      url: `/?login-approval=${challengeRef.id}`,
      data: {
        challengeId: challengeRef.id,
        challenge_id: challengeRef.id,
      },
    });
    // Push to auth-uid alias as well (Despia/OneSignal external_id drift).
    if (profileId !== uid) {
      await dispatchOneSignalToProfile(uid, {
        title: 'Approve sign-in?',
        body: `New sign-in from ${place}. Was this you?`,
        type: 'login_approval',
        url: `/?login-approval=${challengeRef.id}`,
        data: {
          challengeId: challengeRef.id,
          challenge_id: challengeRef.id,
        },
      });
    }

    return {
      ok: true,
      sessionId: sessionRef.id,
      challengeId: challengeRef.id,
      expiresAt,
      deviceLabel,
      geo: { city: geo.city || null, country: geo.country || null, ip: geo.ip, region: geo.region || null },
      notified: true,
      requiresApproval: true,
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

async function mintCustomTokenFromGoogleIdToken(idToken: string): Promise<string> {
  const client = new OAuth2Client(GOOGLE_WEB_CLIENT_ID);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: GOOGLE_WEB_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  const sub = payload?.sub;
  if (!sub) {
    throw new HttpsError('unauthenticated', 'invalid_token');
  }

  const email = payload.email?.trim().toLowerCase() || undefined;
  const emailVerified = !!payload.email_verified;
  const displayName = payload.name || undefined;
  const photoURL = payload.picture || undefined;

  let uid: string | null = null;
  try {
    const existing = await auth.getUserByProviderUid('google.com', sub);
    uid = existing.uid;
  } catch {
    if (email) {
      try {
        const byEmail = await auth.getUserByEmail(email);
        await auth.updateUser(byEmail.uid, {
          providerToLink: {
            providerId: 'google.com',
            uid: sub,
            email,
            displayName,
            photoURL,
          },
          emailVerified: emailVerified || byEmail.emailVerified,
          displayName: displayName || byEmail.displayName,
          photoURL: photoURL || byEmail.photoURL,
        });
        uid = byEmail.uid;
      } catch {
        /* create below */
      }
    }
    if (!uid) {
      const created = await auth.createUser({
        email,
        emailVerified,
        displayName,
        photoURL,
      });
      try {
        await auth.updateUser(created.uid, {
          providerToLink: {
            providerId: 'google.com',
            uid: sub,
            email,
            displayName,
            photoURL,
          },
        });
      } catch (linkErr) {
        console.warn('[exchange_google] providerToLink failed', linkErr);
      }
      uid = created.uid;
    }
  }

  return auth.createCustomToken(uid, { provider: 'google.com' });
}

const APPLE_SERVICES_ID = 'com.despia.vybe.web';
const APPLE_JWKS_URI = 'https://appleid.apple.com/auth/keys';

type AppleIdTokenPayload = {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  nonce?: string;
  iss?: string;
  aud?: string | string[];
};

/** Verify Apple id_token (JWKS) and mint a short Firebase custom token — same handoff as Google. */
async function mintCustomTokenFromAppleIdToken(
  idToken: string,
  expectedNonce?: string,
): Promise<string> {
  const { createHash } = await import('crypto');
  // Transitively available via firebase-admin; verify Apple JWKS + mint custom token.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jwksClient = ((await import('jwks-rsa')) as any).default || (await import('jwks-rsa'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jwt = ((await import('jsonwebtoken')) as any).default || (await import('jsonwebtoken'));

  const client = jwksClient({ jwksUri: APPLE_JWKS_URI, cache: true });

  // Decode header first — jwt.verify's getKey callback sometimes omits kid,
  // which makes jwks-rsa throw "No KID specified and JWKS endpoint returned more than 1 key".
  const unverified = jwt.decode(idToken, { complete: true }) as {
    header?: { kid?: string; alg?: string };
    payload?: AppleIdTokenPayload;
  } | null;
  const kid = unverified?.header?.kid;
  if (!kid) {
    throw new HttpsError('unauthenticated', 'Apple token missing kid');
  }

  const signingKey = await new Promise<string>((resolve, reject) => {
    client.getSigningKey(kid, (err: Error | null, key?: { getPublicKey: () => string }) => {
      if (err || !key) {
        reject(err || new Error('apple_jwks_key_missing'));
        return;
      }
      resolve(key.getPublicKey());
    });
  });

  const payload = await new Promise<AppleIdTokenPayload>((resolve, reject) => {
    jwt.verify(
      idToken,
      signingKey,
      {
        algorithms: ['RS256'],
        audience: APPLE_SERVICES_ID,
        issuer: 'https://appleid.apple.com',
      },
      (err: Error | null, decoded?: AppleIdTokenPayload) => {
        if (err || !decoded) {
          reject(err || new Error('invalid_apple_token'));
          return;
        }
        resolve(decoded);
      },
    );
  });

  const sub = payload.sub;
  if (!sub) {
    throw new HttpsError('unauthenticated', 'invalid_token');
  }

  if (expectedNonce && payload.nonce) {
    const hashedHex = createHash('sha256').update(expectedNonce).digest('hex');
    const hashedB64 = createHash('sha256').update(expectedNonce).digest('base64');
    const hashedB64Url = hashedB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    // Legacy clients pre-hashed the authorize nonce; Apple hashed again → double.
    const doubleHex = createHash('sha256').update(hashedHex).digest('hex');
    const doubleB64 = createHash('sha256').update(hashedHex).digest('base64');
    const doubleB64Url = doubleB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const tokenNonce = String(payload.nonce);
    const ok =
      tokenNonce === expectedNonce ||
      tokenNonce === hashedHex ||
      tokenNonce === hashedB64 ||
      tokenNonce === hashedB64Url ||
      tokenNonce === doubleHex ||
      tokenNonce === doubleB64 ||
      tokenNonce === doubleB64Url;
    if (!ok) {
      console.warn('[exchange_apple] nonce_mismatch', {
        tokenNonceLen: tokenNonce.length,
        tokenNoncePrefix: tokenNonce.slice(0, 12),
        expectedLen: expectedNonce.length,
        matchHex: tokenNonce === hashedHex,
        matchB64Url: tokenNonce === hashedB64Url,
        matchDoubleHex: tokenNonce === doubleHex,
      });
      try {
        await db.collection('oauth_debug_events').add({
          sessionId: 'bd2545',
          event: 'apple_nonce_mismatch',
          hypothesisId: 'N',
          location: 'auth.ts:mintCustomTokenFromAppleIdToken',
          payload: {
            tokenNonceLen: tokenNonce.length,
            tokenNoncePrefix: tokenNonce.slice(0, 12),
            expectedLen: expectedNonce.length,
            matchHex: tokenNonce === hashedHex,
            matchB64Url: tokenNonce === hashedB64Url,
            matchDoubleHex: tokenNonce === doubleHex,
          },
          createdAt: Date.now(),
        });
      } catch {
        /* debug only */
      }
      throw new HttpsError('unauthenticated', 'nonce_mismatch');
    }
  }

  const email = payload.email?.trim().toLowerCase() || undefined;
  const emailVerified =
    payload.email_verified === true ||
    payload.email_verified === 'true' ||
    Boolean(email);

  let uid: string | null = null;
  try {
    const existing = await auth.getUserByProviderUid('apple.com', sub);
    uid = existing.uid;
  } catch {
    if (email) {
      try {
        const byEmail = await auth.getUserByEmail(email);
        await auth.updateUser(byEmail.uid, {
          providerToLink: {
            providerId: 'apple.com',
            uid: sub,
            email,
          },
          emailVerified: emailVerified || byEmail.emailVerified,
        });
        uid = byEmail.uid;
      } catch {
        /* create below */
      }
    }
    if (!uid) {
      const created = await auth.createUser({
        email,
        emailVerified,
      });
      try {
        await auth.updateUser(created.uid, {
          providerToLink: {
            providerId: 'apple.com',
            uid: sub,
            email,
          },
        });
      } catch (linkErr) {
        console.warn('[exchange_apple] providerToLink failed', linkErr);
      }
      uid = created.uid;
    }
  }

  return auth.createCustomToken(uid, { provider: 'apple.com' });
}

/** One-time Despia deeplink payload (≤2 min). Admin SDK only — no client rules. */
async function stashOAuthHandoff(payload: {
  provider: string;
  customToken?: string;
  idToken?: string;
  nonce?: string;
}): Promise<string> {
  const code = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + 2 * 60 * 1000;
  const row = {
    provider: payload.provider,
    customToken: payload.customToken || null,
    idToken: payload.idToken || null,
    nonce: payload.nonce || null,
    expiresAt,
    createdAt: new Date().toISOString(),
  };
  await db.collection('oauth_handoffs').doc(code).set(row);
  // Index by OAuth nonce so the in-app WebView can poll even if the Despia
  // deeplink never reinjects into window.location / window.url.
  const nonce = String(payload.nonce || '').trim();
  if (nonce && /^[a-f0-9]{16,64}$/i.test(nonce)) {
    await db.collection('oauth_nonce_handoffs').doc(nonce.toLowerCase()).set({
      code,
      provider: payload.provider,
      expiresAt,
      createdAt: row.createdAt,
    });
  }
  return code;
}

function decodeDespiaOAuthState(state: string | null | undefined): {
  scheme: string;
  nonce: string;
  provider: string;
  cv?: string;
} | null {
  if (!state) return null;
  try {
    const padded = state.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(padded + '==='.slice((padded.length + 3) % 4), 'base64').toString('utf8');
    const parsed = JSON.parse(json) as {
      scheme?: string;
      nonce?: string;
      provider?: string;
      cv?: string;
    };
    if (!parsed.scheme || !parsed.nonce || !parsed.provider) return null;
    return {
      scheme: parsed.scheme,
      nonce: parsed.nonce,
      provider: parsed.provider,
      cv: typeof parsed.cv === 'string' ? parsed.cv : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Blank page that fires a SHORT scheme://oauth/… deeplink so Despia closes
 * ASWeb / Custom Tabs. Never shows Open VYBE.
 *
 * Critical: no meta-refresh to custom schemes (iOS: "address is invalid"),
 * no long state/PKCE in the deeplink (keeps URL under iOS limits),
 * no rapid re-fire loop (Android CCT endless spinner).
 */
function despiaSilentCloseHtml(deeplink: string): string {
  const safeJs = JSON.stringify(deeplink);
  const safeAttr = deeplink
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta http-equiv="refresh" content="0;url=${safeAttr}"/><title></title><style>html,body{margin:0;min-height:100%;background:#0B0B10}</style><script>(function(){var d=${safeJs};function go(){try{location.replace(d)}catch(e){}try{location.href=d}catch(e2){}}go();setTimeout(go,60);})();</script></head><body></body></html>`;
}

/** Short Despia close URL — hc= only (never append long OAuth state / PKCE). */
function despiaCloseDeeplink(scheme: string, query: string): string {
  const clean = (scheme || 'com.despia.vybe').trim() || 'com.despia.vybe';
  return `${clean}://oauth/auth?${query}`;
}

/**
 * HTTP 302 → custom-scheme close. ASWebAuthenticationSession intercepts
 * HTTPS→custom-scheme redirects and dismisses the sheet. Direct JS
 * `location.href = com.despia.vybe://…` often opens Safari instead and leaves
 * the sheet stuck (seen on iOS Despia).
 *
 * LEGACY — for Despia ASWeb / browser oauth:// callback only.
 * FORBIDDEN when `native_ios_auth_v1` + nativeauth:// bridge is active:
 * that path signs in via signInWithCredential in the WebView and must never
 * hit oauthDismiss or native-callback.html.
 */
export const oauthDismiss = onRequest(
  {
    cors: true,
    invoker: 'public',
    memory: '256MiB',
    cpu: 0.083,
    concurrency: 1,
    maxInstances: 4,
    // [iOS-only path] Keep one warm instance — cold start (~3s) left ASWeb blank
    // after native-callback fireClose (runtime: 2026-07-17T16:31:50Z latency 3.07s).
    minInstances: 1,
  },
  async (req, res) => {
    const rawQs = typeof req.url === 'string' && req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';
    const safeQs = rawQs.replace(/[^a-zA-Z0-9_=&%.-]/g, '').slice(0, 512);
    const schemeParam = typeof req.query?.scheme === 'string' ? String(req.query.scheme).trim() : '';
    const scheme =
      schemeParam && /^[a-z0-9.-]+$/i.test(schemeParam) && !schemeParam.includes('://')
        ? schemeParam
        : 'com.despia.vybe';
    const wantHtml =
      req.query?.format === 'html' ||
      req.query?.html === '1' ||
      req.query?.html === 'true';
    // Drop scheme= / format= / html= from qs (already applied).
    const qs = safeQs
      .split('&')
      .filter(
        (p) =>
          p &&
          !p.startsWith('scheme=') &&
          !p.startsWith('format=') &&
          !p.startsWith('html='),
      )
      .join('&');
    const deeplink = despiaCloseDeeplink(scheme, qs || 'wait=1');
    res.set('Cache-Control', 'no-store');
    // Help ASWeb clients that honor Refresh alongside/instead of Location.
    res.set('Refresh', `0;url=${deeplink}`);
    if (wantHtml) {
      res.status(200).type('html').send(despiaSilentCloseHtml(deeplink));
      return;
    }
    res.redirect(302, deeplink);
  },
);

/** Google OAuth redirect for Despia — must match Google Cloud Console + client. */
const GOOGLE_OAUTH_REDIRECT_URI = 'https://vybehub.app/native-callback.html';
const GOOGLE_OAUTH_REDIRECT_URIS = new Set([
  GOOGLE_OAUTH_REDIRECT_URI,
  // Legacy path — still accept token exchange if an older build launched auth with it.
  'https://vybehub.app/google-callback.html',
]);

async function exchangeGoogleAuthCode(
  code: string,
  codeVerifier: string,
  redirectUri: string = GOOGLE_OAUTH_REDIRECT_URI,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: GOOGLE_WEB_CLIENT_ID,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await tokenRes.json()) as { id_token?: string; error?: string; error_description?: string };
  if (!tokenRes.ok || !json.id_token) {
    const msg = json.error_description || json.error || `token_exchange_${tokenRes.status}`;
    throw new Error(msg);
  }
  return json.id_token;
}

/**
 * Google Sign-In — legacy Firebase Hosting path.
 * Prefer https://vybehub.app/native-callback.html (static) so users see vybehub.app.
 * Google Cloud Console redirect URI must include that vybehub.app URL.
 */
export const googleOAuthCallback = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
  const q = req.query || {};
  const pick = (key: string): string => {
    const raw = q[key];
    return typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? String(raw[0] || '').trim() : '';
  };

  const error = pick('error');
  const state = pick('state');
  const authCode = pick('code');
  const stateObj = decodeDespiaOAuthState(state);
  const scheme = (stateObj?.scheme || 'com.despia.vybe').trim() || 'com.despia.vybe';

  res.set('Cache-Control', 'no-store');

  if (error) {
    const err = encodeURIComponent(error.slice(0, 64));
    res.status(200).type('html').send(despiaSilentCloseHtml(despiaCloseDeeplink(scheme, `error=${err}`)));
    return;
  }

  if (!authCode || !stateObj?.cv) {
    res
      .status(200)
      .type('html')
      .send(despiaSilentCloseHtml(despiaCloseDeeplink(scheme, 'error=missing_code')));
    return;
  }

  try {
    const ip = req.ip || 'anon';
    enforceRateLimit(await rateLimit(`google-oauth-cb:${ip}`, 30, 600));
    // Legacy firebaseapp.com redirect — only if still registered in Google Console.
    const idToken = await exchangeGoogleAuthCode(
      authCode,
      stateObj.cv,
      'https://vybe-daaab.firebaseapp.com/google-callback',
    );
    const customToken = await mintCustomTokenFromGoogleIdToken(idToken);
    const handoff = await stashOAuthHandoff({
      provider: 'google',
      customToken,
      nonce: stateObj.nonce || undefined,
    });
    res
      .status(200)
      .type('html')
      .send(despiaSilentCloseHtml(despiaCloseDeeplink(scheme, `hc=${encodeURIComponent(handoff)}`)));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'exchange_failed';
    console.error('[googleOAuthCallback] failed', message);
    res
      .status(200)
      .type('html')
      .send(despiaSilentCloseHtml(despiaCloseDeeplink(scheme, 'error=exchange_failed')));
  }
});

/**
 * Apple Sign in with Apple — Android Despia oauth:// return.
 * Apple requires response_mode=form_post when name/email scopes are requested.
 * Static native-callback.html cannot read POST bodies, so this HTTP endpoint
 * stashes a short hc= code and silently closes into com.despia.vybe://oauth/auth.
 *
 * Return URL (Apple Services ID): https://vybe-daaab.firebaseapp.com/apple-callback
 */
export const appleOAuthCallback = onRequest({ cors: true, invoker: 'public' }, async (req, res) => {
  const body = (req.method === 'POST' ? req.body : null) || {};
  const q = req.query || {};
  const pick = (key: string): string => {
    const fromBody = body[key];
    const fromQuery = q[key];
    const raw = fromBody != null ? fromBody : fromQuery;
    return typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? String(raw[0] || '').trim() : '';
  };

  const error = pick('error');
  const state = pick('state');
  const idToken = pick('id_token');
  const stateObj = decodeDespiaOAuthState(state);
  const scheme = (stateObj?.scheme || 'com.despia.vybe').trim() || 'com.despia.vybe';

  res.set('Cache-Control', 'no-store');

  if (error) {
    res
      .status(200)
      .type('html')
      .send(despiaSilentCloseHtml(despiaCloseDeeplink(scheme, `error=${encodeURIComponent(error.slice(0, 64))}`)));
    return;
  }

  if (!idToken) {
    res
      .status(200)
      .type('html')
      .send(despiaSilentCloseHtml(despiaCloseDeeplink(scheme, 'error=missing_token')));
    return;
  }

  try {
    const ip = req.ip || 'anon';
    enforceRateLimit(await rateLimit(`apple-oauth-cb:${ip}`, 30, 600));
    const customToken = await mintCustomTokenFromAppleIdToken(idToken, stateObj?.nonce || undefined);
    const code = await stashOAuthHandoff({
      provider: 'apple',
      customToken,
      nonce: stateObj?.nonce || undefined,
    });
    res
      .status(200)
      .type('html')
      .send(despiaSilentCloseHtml(despiaCloseDeeplink(scheme, `hc=${encodeURIComponent(code)}`)));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'stash_failed';
    console.error('[appleOAuthCallback] failed', message);
    res
      .status(200)
      .type('html')
      .send(despiaSilentCloseHtml(despiaCloseDeeplink(scheme, 'error=stash_failed')));
  }
});

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
 * auth-qr — Quick Sign-In QR pairing + iOS Google id_token → short custom_token exchange.
 * create (public) → poll (public) → claim (signed-in device) → redeem (public → custom token).
 * exchange_google (public) — verify Google id_token, mint short Firebase custom token for deeplink.
 *
 * LEGACY for Despia ASWeb / native-callback handoff only.
 * FORBIDDEN on the native_ios_auth_v1 + nativeauth:// bridge path (use
 * signInWithCredential in the WebView instead — no exchange_* / oauthDismiss).
 */
export const authQr = onCall(
  {
    cors: true,
    // Keep under Cloud Run regional CPU quota (project has many 1-CPU services).
    memory: '256MiB',
    cpu: 0.083,
    concurrency: 1,
    maxInstances: 2,
  },
  async (request) => {
  const data = (request.data || {}) as {
    action?: string;
    nonce?: string;
    intent?: 'approve' | 'deny';
    idToken?: string;
    id_token?: string;
  };
  const action = (data.action || 'create').toLowerCase();
  const nonce = typeof data.nonce === 'string' ? data.nonce.trim() : '';

  /**
   * Debug-session OAuth telemetry (Despia ASWeb cannot reach localhost ingest).
   * Writes are session-gated (bd2545) + rate-limited; dump stays admin-only.
   */
  if (action === 'debug_oauth') {
    const ip = clientIpFromRequest(request) || 'anon';
    enforceRateLimit(await rateLimit(`debug_oauth:${ip}`, 120, 60));
    const event = String((data as { event?: string }).event || '').slice(0, 120);
    const hypothesisId = String((data as { hypothesisId?: string }).hypothesisId || '').slice(0, 8);
    const location = String((data as { location?: string }).location || '').slice(0, 160);
    const payload = (data as { payload?: Record<string, unknown> }).payload;
    const safePayload =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? Object.fromEntries(
            Object.entries(payload)
              .slice(0, 20)
              .map(([k, v]) => [
                String(k).slice(0, 40),
                typeof v === 'string'
                  ? v.slice(0, 200)
                  : typeof v === 'number' || typeof v === 'boolean' || v == null
                    ? v
                    : String(v).slice(0, 120),
              ]),
          )
        : {};
    await db.collection('oauth_debug_events').add({
      sessionId: 'bd2545',
      event,
      hypothesisId,
      location,
      payload: safePayload,
      createdAt: Date.now(),
    });
    return { ok: true };
  }

  if (action === 'debug_oauth_dump') {
    await requireAdmin(request);
    // Prefer newest-by-createdAt (single-field index). Filtering sessionId
    // + orderBy createdAt needs a composite index we may not have, and a
    // bare where+limit returns an arbitrary sample that misses fresh boots.
    const snap = await db
      .collection('oauth_debug_events')
      .orderBy('createdAt', 'desc')
      .limit(120)
      .get();
    const events = snap.docs
      .map((d) => d.data())
      .filter((e) => String((e as { sessionId?: string }).sessionId || '') === 'bd2545')
      .slice(0, 50)
      .reverse();
    return { events };
  }


  // LEGACY ASWeb/callback only — forbidden when native_ios_auth_v1 + nativeauth bridge.
  if (action === 'exchange_google') {
    const ip = request.rawRequest?.ip || 'anon';
    enforceRateLimit(await rateLimit(`oauth-exchange:${ip}`, 20, 600));
    const idToken = String(data.idToken || data.id_token || '').trim();
    const oauthNonce = String((data as { nonce?: string }).nonce || '').trim();
    if (!idToken) {
      throw new HttpsError('invalid-argument', 'idToken required');
    }
    try {
      const customToken = await mintCustomTokenFromGoogleIdToken(idToken);
      // Short handoff code for Despia deeplinks — long JWTs / custom tokens
      // exceed iOS URL limits → Safari “The address is invalid.”
      const code = await stashOAuthHandoff({
        provider: 'google',
        customToken,
        idToken,
        nonce: oauthNonce || undefined,
      });
      return { customToken, custom_token: customToken, code };
    } catch (err: unknown) {
      if (err instanceof HttpsError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      console.error('[authQr] exchange_google failed', message);
      throw new HttpsError('unauthenticated', 'Google token verification failed');
    }
  }

  /**
   * exchange_google_code — PKCE authorization-code exchange for
   * https://vybehub.app/native-callback.html (Despia Custom Tabs).
   * LEGACY — forbidden when native_ios_auth_v1 + nativeauth:// bridge is active.
   */
  if (action === 'exchange_google_code') {
    const ip = request.rawRequest?.ip || 'anon';
    enforceRateLimit(await rateLimit(`oauth-exchange-code:${ip}`, 20, 600));
    const authCode = String((data as { code?: string }).code || '').trim();
    const codeVerifier = String((data as { codeVerifier?: string }).codeVerifier || '').trim();
    const redirectUri = String((data as { redirectUri?: string }).redirectUri || '').trim() || GOOGLE_OAUTH_REDIRECT_URI;
    const oauthNonce = String((data as { nonce?: string }).nonce || '').trim();
    if (!authCode || !codeVerifier) {
      throw new HttpsError('invalid-argument', 'code and codeVerifier required');
    }
    if (!GOOGLE_OAUTH_REDIRECT_URIS.has(redirectUri)) {
      throw new HttpsError('invalid-argument', 'redirectUri not allowed');
    }
    try {
      const idToken = await exchangeGoogleAuthCode(authCode, codeVerifier, redirectUri);
      const customToken = await mintCustomTokenFromGoogleIdToken(idToken);
      const handoff = await stashOAuthHandoff({
        provider: 'google',
        customToken,
        nonce: oauthNonce || undefined,
      });
      return { code: handoff };
    } catch (err: unknown) {
      if (err instanceof HttpsError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      console.error('[authQr] exchange_google_code failed', message);
      throw new HttpsError('unauthenticated', message || 'Google code exchange failed');
    }
  }

  /** Stash Apple (or other) tokens server-side; return short deeplink code. */
  if (action === 'stash_oauth') {
    const ip = request.rawRequest?.ip || 'anon';
    enforceRateLimit(await rateLimit(`oauth-stash:${ip}`, 30, 600));
    const provider = String((data as { provider?: string }).provider || '').trim() || 'apple';
    const idToken = String(data.idToken || data.id_token || '').trim();
    let customToken = String((data as { customToken?: string }).customToken || '').trim();
    const oauthNonce = String((data as { nonce?: string }).nonce || '').trim();
    if (!idToken && !customToken) {
      throw new HttpsError('invalid-argument', 'idToken or customToken required');
    }
    // Prefer custom token handoff (same as Google) so App Link remount can signInWithCustomToken.
    if (!customToken && idToken && provider === 'apple') {
      try {
        customToken = await mintCustomTokenFromAppleIdToken(idToken, oauthNonce || undefined);
      } catch (err: unknown) {
        if (err instanceof HttpsError) throw err;
        const message = err instanceof Error ? err.message : String(err);
        console.error('[authQr] stash_oauth apple mint failed', message);
        throw new HttpsError('unauthenticated', 'Apple token verification failed');
      }
    }
    const code = await stashOAuthHandoff({
      provider,
      idToken: idToken || undefined,
      customToken: customToken || undefined,
      nonce: oauthNonce || undefined,
    });
    return { code };
  }

  /** exchange_apple — verify Apple id_token, mint custom token, return short hc= (parity with Google).
   * LEGACY ASWeb/callback only — forbidden when native_ios_auth_v1 + nativeauth bridge. */
  if (action === 'exchange_apple') {
    const ip = request.rawRequest?.ip || 'anon';
    enforceRateLimit(await rateLimit(`oauth-exchange-apple:${ip}`, 20, 600));
    const idToken = String(data.idToken || data.id_token || '').trim();
    const oauthNonce = String((data as { nonce?: string }).nonce || '').trim();
    if (!idToken) {
      throw new HttpsError('invalid-argument', 'idToken required');
    }
    try {
      const customToken = await mintCustomTokenFromAppleIdToken(idToken, oauthNonce || undefined);
      const code = await stashOAuthHandoff({
        provider: 'apple',
        customToken,
        idToken,
        nonce: oauthNonce || undefined,
      });
      return { customToken, custom_token: customToken, code };
    } catch (err: unknown) {
      if (err instanceof HttpsError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      console.error('[authQr] exchange_apple failed', message);
      throw new HttpsError('unauthenticated', 'Apple token verification failed');
    }
  }

  /** Redeem one-time OAuth handoff (Despia WebView). */
  if (action === 'redeem_oauth_code') {
    const ip = request.rawRequest?.ip || 'anon';
    enforceRateLimit(await rateLimit(`oauth-redeem:${ip}`, 40, 600));
    const handoffCode = String((data as { code?: string }).code || '').trim();
    if (!/^[a-f0-9]{32}$/i.test(handoffCode)) {
      throw new HttpsError('invalid-argument', 'code required');
    }
    const codeKey = handoffCode.toLowerCase();
    const ref = db.collection('oauth_handoffs').doc(codeKey);
    const usedRef = db.collection('oauth_handoffs_used').doc(codeKey);

    const toPayload = (row: Record<string, unknown>) => ({
      provider: (row.provider as string) || null,
      customToken: (row.customToken as string) || (row.custom_token as string) || null,
      custom_token: (row.customToken as string) || (row.custom_token as string) || null,
      idToken: (row.idToken as string) || (row.id_token as string) || null,
      id_token: (row.idToken as string) || (row.id_token as string) || null,
      nonce: (row.nonce as string) || null,
    });

    // Idempotent: App Link remount + nonce poll both redeem the same hc=.
    // First delete wins; later callers read oauth_handoffs_used until TTL.
    type RedeemTx =
      | { ok: true; payload: ReturnType<typeof toPayload> }
      | { ok: false; code: 'expired' | 'not-found' };

    const result = await db.runTransaction(async (tx): Promise<RedeemTx> => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const row = (snap.data() || {}) as Record<string, unknown>;
        const expiresAt = typeof row.expiresAt === 'number' ? row.expiresAt : 0;
        if (!expiresAt || expiresAt < Date.now()) {
          tx.delete(ref);
          return { ok: false, code: 'expired' };
        }
        tx.delete(ref);
        tx.set(usedRef, {
          ...row,
          redeemedAt: Date.now(),
          expiresAt,
        });
        const rowNonce = String(row.nonce || '').trim().toLowerCase();
        if (rowNonce) {
          tx.delete(db.collection('oauth_nonce_handoffs').doc(rowNonce));
        }
        return { ok: true, payload: toPayload(row) };
      }

      const used = await tx.get(usedRef);
      if (!used.exists) {
        return { ok: false, code: 'not-found' };
      }
      const row = (used.data() || {}) as Record<string, unknown>;
      const expiresAt = typeof row.expiresAt === 'number' ? row.expiresAt : 0;
      if (!expiresAt || expiresAt < Date.now()) {
        tx.delete(usedRef);
        return { ok: false, code: 'expired' };
      }
      return { ok: true, payload: toPayload(row) };
    });

    if (!result.ok) {
      if (result.code === 'expired') {
        throw new HttpsError('deadline-exceeded', 'OAuth code expired');
      }
      throw new HttpsError('not-found', 'OAuth code expired or already used');
    }

    return result.payload;
  }

  /**
   * Poll by OAuth nonce — WebView completion when Despia deeplink reclaim fails.
   * Returns { ready:false } until native-callback / apple callback stashes a code.
   */
  if (action === 'poll_oauth_nonce') {
    const ip = request.rawRequest?.ip || 'anon';
    enforceRateLimit(await rateLimit(`oauth-poll:${ip}`, 120, 600));
    const oauthNonce = String((data as { nonce?: string }).nonce || '').trim().toLowerCase();
    if (!/^[a-f0-9]{16,64}$/i.test(oauthNonce)) {
      throw new HttpsError('invalid-argument', 'nonce required');
    }
    const snap = await db.collection('oauth_nonce_handoffs').doc(oauthNonce).get();
    if (!snap.exists) {
      return { ready: false as const };
    }
    const row = snap.data() || {};
    const expiresAt = typeof row.expiresAt === 'number' ? row.expiresAt : 0;
    if (!expiresAt || expiresAt < Date.now()) {
      try {
        await snap.ref.delete();
      } catch {
        /* ignore */
      }
      return { ready: false as const };
    }
    const code = String(row.code || '').trim();
    if (!/^[a-f0-9]{32}$/i.test(code)) {
      return { ready: false as const };
    }
    return {
      ready: true as const,
      code,
      provider: row.provider || null,
    };
  }

  /** Public: map username → login email (or pass-through email). Used before password sign-in. */
  if (action === 'resolve_login') {
    const ip = request.rawRequest?.ip || 'anon';
    enforceRateLimit(await rateLimit(`login-resolve:${ip}`, 30, 600));
    const identifier = String(
      (data as { identifier?: string; username?: string; email?: string }).identifier ||
        (data as { identifier?: string; username?: string; email?: string }).username ||
        (data as { identifier?: string; username?: string; email?: string }).email ||
        '',
    ).trim();
    if (!identifier) {
      throw new HttpsError('invalid-argument', 'identifier required');
    }
    if (EMAIL_REGEX.test(identifier)) {
      return { email: identifier.toLowerCase(), kind: 'email' as const };
    }

    const username = identifier.replace(/^@/, '').toLowerCase().replace(/\s+/g, '');
    if (username.length < 3) {
      throw new HttpsError('not-found', 'Account not found');
    }

    const rawUsername = identifier.replace(/^@/, '').trim();
    let profileSnap = await db.collection('profiles').where('username', '==', username).limit(1).get();
    if (profileSnap.empty && rawUsername !== username) {
      // Legacy rows may still store mixed-case usernames.
      profileSnap = await db.collection('profiles').where('username', '==', rawUsername).limit(1).get();
    }

    let authUid = '';
    let email = '';

    if (!profileSnap.empty) {
      const profile = profileSnap.docs[0].data() as {
        user_id?: string | null;
        email?: string | null;
      };
      authUid = String(profile.user_id || profileSnap.docs[0].id || '').trim();
      email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '';
    } else {
      // Fallback: username stored on user_auth_index (common after renames / migrations).
      const indexSnap = await db
        .collection('user_auth_index')
        .where('username', '==', username)
        .limit(1)
        .get();
      if (!indexSnap.empty) {
        const idx = indexSnap.docs[0].data() as {
          profile_id?: string | null;
          email?: string | null;
        };
        authUid = indexSnap.docs[0].id;
        email = typeof idx.email === 'string' ? idx.email.trim().toLowerCase() : '';
        if (!email && idx.profile_id) {
          const p = await db.collection('profiles').doc(String(idx.profile_id)).get();
          const pe = p.data()?.email;
          if (typeof pe === 'string') email = pe.trim().toLowerCase();
        }
      }
    }

    if (!email && authUid) {
      try {
        const userRecord = await auth.getUser(authUid);
        email = (userRecord.email || '').trim().toLowerCase();
        if (!email && userRecord.providerData?.length) {
          const providerEmail = userRecord.providerData.find((p) => p.email)?.email;
          if (providerEmail) email = providerEmail.trim().toLowerCase();
        }
      } catch {
        /* fall through */
      }
    }

    if (!email || !EMAIL_REGEX.test(email)) {
      throw new HttpsError('not-found', 'Account not found');
    }
    return { email, kind: 'username' as const };
  }

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

/** manage-account — schedule / cancel account deletion (and aliases from older clients). */
export const manageAccount = onCall(async (request) => {
  const uid = requireAuth(request);
  const raw = (request.data || {}) as { action?: string };
  const action = String(raw.action || '').toLowerCase();
  const requestDelete =
    action === 'request_delete' || action === 'request_deletion' || action === 'delete';
  const cancelDelete =
    action === 'cancel_delete' || action === 'cancel_deletion';

  if (requestDelete) {
    await db.collection('account_deletion_requests').doc(uid).set({
      user_id: uid, status: 'pending', requested_at: new Date().toISOString(),
    });
  } else if (cancelDelete) {
    await db.collection('account_deletion_requests').doc(uid).delete();
  } else if (action === 'export') {
    // Lightweight export stub — full dump is still via support / future job.
    const profile = await db.collection('profiles').where('user_id', '==', uid).limit(1).get();
    const profileData = profile.empty ? null : profile.docs[0].data();
    return {
      ok: true,
      success: true,
      exported_at: new Date().toISOString(),
      user_id: uid,
      profile: profileData,
    };
  } else if (action) {
    throw new HttpsError('invalid-argument', `Unknown action: ${action}`);
  }
  return { ok: true, success: true };
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

/** check-premium-subscription — shared server-owned subscription/gift authority. */
export const checkPremiumSubscription = onCall(async (request) => {
  return premiumStatusForRequest(request);
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
  // Intentionally unimplemented: clients must never write Secret Manager.
  // Use scripts/setup-*-secrets.mjs (e.g. npm run setup:stripe-secrets).
  throw new HttpsError(
    'unimplemented',
    'Server API keys cannot be saved in the Admin UI. Use CLI: npm run setup:stripe-secrets (or setup:gemini-secrets / setup:onesignal-secrets), then redeploy the matching functions.',
  );
});
