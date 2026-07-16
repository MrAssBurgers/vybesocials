import { randomBytes } from 'crypto';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { OAuth2Client } from 'google-auth-library';
import { db, auth, requireAuth, requireAdmin, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { sendPasswordResetEmail, type PasswordResetSendProvider } from './_shared/passwordResetEmail.js';
import { claimProfileByEmailForUid } from './_shared/claimProfileByEmail.js';

/** Must match Firebase Console Google web client (public). Used by native-callback exchange. */
const GOOGLE_WEB_CLIENT_ID =
  '728651793473-71p1iahdr79ali0o7en8ktirklfjf3pf.apps.googleusercontent.com';

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
): Promise<{ ip: string | null; city?: string; region?: string; country?: string }> {
  const headers = request.rawRequest?.headers || {};
  const ip = clientIpFromRequest(request);
  const countryHeader =
    (typeof headers['x-appengine-country'] === 'string' && headers['x-appengine-country']) ||
    (typeof headers['cf-ipcountry'] === 'string' && headers['cf-ipcountry']) ||
    null;
  const base: { ip: string | null; city?: string; region?: string; country?: string } = {
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
      error?: boolean;
    };
    if (j?.error) return base;
    return {
      ip,
      city: j.city || undefined,
      region: j.region || undefined,
      country: j.country_name || j.country || base.country,
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
        // Clear stale "Was this you?" prompts that were incorrectly created for this install.
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
          if (sameDevice || resumeNoise) {
            batch.set(challenge.ref, { status: 'expired', resolved_at: now }, { merge: true });
            cleared += 1;
          }
        }
        if (cleared > 0) await batch.commit();
        return { ok: true, sessionId: doc.id, notified: false, reason: 'known_session' };
      }
    }

    const sessionRef = db.collection('user_sessions').doc();
    await sessionRef.set({
      user_id: uid,
      session_token_hash: sessionHash || null,
      device_label: parseDeviceLabel(userAgent),
      user_agent: userAgent || null,
      trusted: isResume,
      created_at: now,
      last_seen_at: now,
      revoked_at: null,
    });

    // Cold starts / resumes register the install but never spam approvals or history.
    if (isResume) {
      return { ok: true, sessionId: sessionRef.id, notified: false, reason: 'session_resume' };
    }

    const geo = await resolveLoginGeo(request);

    await db.collection('login_history').add({
      user_id: uid,
      method,
      success: true,
      device_label: parseDeviceLabel(userAgent),
      user_agent: userAgent || null,
      created_at: now,
      metadata: {
        session_id: sessionRef.id,
        session_hash: sessionHash || null,
        ip: geo.ip,
        geo,
      },
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
        device: { label: parseDeviceLabel(userAgent), browser: userAgent || null, os: parseDeviceLabel(userAgent) },
        method,
        ip: geo.ip,
        geo,
      },
    });

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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title></title><style>html,body{margin:0;min-height:100%;background:#0B0B10}</style><script>(function(){var d=${safeJs};function go(){try{location.replace(d)}catch(e){}try{location.href=d}catch(e2){}}go();setTimeout(go,60);})();</script></head><body></body></html>`;
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
 */
export const oauthDismiss = onRequest(
  {
    cors: true,
    invoker: 'public',
    memory: '256MiB',
    cpu: 0.083,
    concurrency: 1,
    maxInstances: 4,
  },
  async (req, res) => {
    const rawQs = typeof req.url === 'string' && req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';
    const safeQs = rawQs.replace(/[^a-zA-Z0-9_=&%.\-]/g, '').slice(0, 512);
    const schemeParam = typeof req.query?.scheme === 'string' ? String(req.query.scheme).trim() : '';
    const scheme =
      schemeParam && /^[a-z0-9.-]+$/i.test(schemeParam) && !schemeParam.includes('://')
        ? schemeParam
        : 'com.despia.vybe';
    // Drop scheme= from qs if present (already applied).
    const qs = safeQs
      .split('&')
      .filter((p) => p && !p.startsWith('scheme='))
      .join('&');
    res.set('Cache-Control', 'no-store');
    res.redirect(302, despiaCloseDeeplink(scheme, qs || 'wait=1'));
  },
);

/** Google OAuth redirect for Despia — must match Google Cloud Console + client. */
const GOOGLE_OAUTH_REDIRECT_URI = 'https://vybehub.app/google-callback.html';

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
 * Prefer https://vybehub.app/google-callback.html (static) so users see vybehub.app.
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

  /** Debug-session OAuth telemetry (Despia cannot reach localhost ingest). */
  if (action === 'debug_oauth') {
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
    const snap = await db.collection('oauth_debug_events').where('sessionId', '==', 'bd2545').limit(80).get();
    const events = snap.docs
      .map((d) => d.data())
      .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
      .slice(-40);
    return { events };
  }

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
   * https://vybehub.app/google-callback.html (Despia Custom Tabs).
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
    if (redirectUri !== GOOGLE_OAUTH_REDIRECT_URI) {
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

  /** exchange_apple — verify Apple id_token, mint custom token, return short hc= (parity with Google). */
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
