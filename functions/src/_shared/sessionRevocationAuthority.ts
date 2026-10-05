import type { Auth, UserRecord } from 'firebase-admin/auth';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { securityRequestId } from './signInPreferencesAuthority.js';

type RevokeAuth = Pick<Auth, 'getUser' | 'revokeRefreshTokens'>;
type Row = Record<string, unknown>;
const revision = (time: FirebaseFirestore.Timestamp | undefined) => time ? `${time.seconds}:${time.nanoseconds}` : null;
const unavailable = () => new HttpsError('unavailable', 'Sign-out has not been confirmed. Retry to check the same request.');
async function activeAccount(auth: RevokeAuth, uid: string) {
  let user: UserRecord;
  try { user = await auth.getUser(uid); } catch (error) {
    if ((error as { code?: string })?.code === 'auth/user-not-found') throw new HttpsError('unauthenticated', 'Sign in again before changing your sessions.');
    throw unavailable();
  }
  if (user.disabled || !user.metadata.creationTime) throw new HttpsError('permission-denied', 'This account cannot change its sessions.');
  return user;
}
// A newly created Auth user may have no previous revocation timestamp.
// Explicit malformed timestamps still fail; absence means no prior cutoff.
const cutoff = (user: UserRecord) => user.tokensValidAfterTime === undefined ? 0 : Date.parse(user.tokensValidAfterTime);
function sameAccount(row: Row, user: UserRecord) {
  return row.owner_uid === user.uid && row.auth_created_at === user.metadata.creationTime;
}
function receipt(row: Row, uid: string, requestId: string) {
  if (row.phase !== 'complete' || !Number.isFinite(row.revoked_before_ms) || !Number.isSafeInteger(row.marked_count)) throw unavailable();
  return { ok: true, ownerUid: uid, requestId, authTime: row.auth_time, scope: 'all-refresh-tokens', revokedBefore: new Date(Number(row.revoked_before_ms)).toISOString(),
    trackedSessionsMarked: Number(row.marked_count), existingAccessMayContinue: true };
}

/** Firebase exposes account-wide refresh-token revocation, not one-device
 * revocation. A durable calling phase prevents a lost response from repeating
 * the Auth mutation and revoking a later sign-in. Ambiguous results stay errors. */
export async function revokeAccountSessions(db: Firestore, auth: RevokeAuth, uid: string, authTime: unknown, raw: unknown) {
  const input = raw as Row | null;
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.all !== true || input.confirmation !== 'all-devices'
    || Object.hasOwn(input, 'sessionId') || Object.keys(input).some(key => !['all', 'confirmation', 'expectedOwnerUid', 'expectedAuthTime', 'requestId'].includes(key))) {
    throw new HttpsError('invalid-argument', 'Only a confirmed account-wide sign-out is supported.');
  }
  if (input.expectedOwnerUid !== uid) throw new HttpsError('failed-precondition', 'Your account changed. Reopen security settings.');
  if (typeof authTime !== 'number' || input.expectedAuthTime !== authTime) throw new HttpsError('failed-precondition', 'Your sign-in changed. Reopen security settings.');
  if (!securityRequestId(input.requestId)) throw new HttpsError('invalid-argument', 'A valid sign-out request is required.');
  const signedInAt = typeof authTime === 'number' && Number.isSafeInteger(authTime) ? authTime * 1000 : NaN;
  const now = Date.now();
  if (!Number.isFinite(signedInAt) || signedInAt > now + 1000 || now - signedInAt > 300_000) throw new HttpsError('failed-precondition', 'Sign in again before signing out all devices.');
  const requestId = input.requestId, user = await activeAccount(auth, uid);
  const ref = db.doc(`_auth_session_revocations/${uid}_${requestId}`), quotaRef = db.doc(`_auth_session_revoke_limits/${uid}`);
  const requestHash = createHash('sha256').update(JSON.stringify([uid, authTime, 'all-devices'])).digest('hex');
  const prepared = await db.runTransaction(async tx => {
    const prior = (await tx.get(ref)).data();
    if (prior) {
      if (!sameAccount(prior, user) || prior.request_hash !== requestHash) throw new HttpsError('failed-precondition', 'This sign-out belongs to an earlier sign-in. Open a new confirmation.');
      return { row: prior, call: false };
    }
    const quota = (await tx.get(quotaRef)).data();
    const sessions = await tx.get(db.collection('user_sessions').where('user_id', '==', uid).where('revoked_at', '==', null).limit(201));
    if (sessions.size > 200) throw new HttpsError('resource-exhausted', 'There are too many tracked devices to confirm this request. Please contact support.');
    const count = quota && quota.reset_at > now ? Number(quota.count) : 0;
    if (!Number.isSafeInteger(count) || count < 0 || count >= 3) throw new HttpsError('resource-exhausted', 'Too many account-wide sign-out requests. Please try again later.');
    const oldCutoff = cutoff(user);
    if (!Number.isFinite(oldCutoff) || oldCutoff > now + 1000) throw unavailable();
    const minimumCutoff = Math.max(Math.floor(now / 1000) * 1000 + 1000, oldCutoff + 1000, signedInAt + 1000);
    const targets = sessions.docs.filter(doc => {
      const created = Date.parse(doc.data().created_at);
      return Number.isFinite(created) && created <= now;
    }).map(doc => ({ id: doc.id, revision: revision(doc.updateTime) }));
    const row: Row = { owner_uid: uid, auth_created_at: user.metadata.creationTime, auth_time: authTime, request_hash: requestHash,
      phase: 'calling', started_at: now, minimum_cutoff: minimumCutoff, lease_until: now + 90_000, targets,
      expireAt: Timestamp.fromMillis(now + 7 * 86400_000) };
    tx.create(ref, row);
    tx.set(quotaRef, { count: count + 1, reset_at: count ? quota!.reset_at : now + 3600_000, expireAt: Timestamp.fromMillis(now + 86400_000) });
    return { row, call: true };
  });
  let currentUser = user;
  if (prepared.call) {
    // Auth cutoffs have second precision. Move beyond the original credentials'
    // second so the current session is included in the requested cutoff.
    const wait = Number(prepared.row.minimum_cutoff) - Date.now() + 10;
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    currentUser = await activeAccount(auth, uid);
    if (!sameAccount(prepared.row, currentUser)) throw new HttpsError('failed-precondition', 'Your account changed. Start sign-in again.');
    if (cutoff(currentUser) < Number(prepared.row.minimum_cutoff)) {
      try { await auth.revokeRefreshTokens(uid); } catch { /* Reconcile before reporting success or failure. */ }
    }
    currentUser = await activeAccount(auth, uid);
  }
  if (!sameAccount(prepared.row, currentUser)) throw new HttpsError('failed-precondition', 'Your account changed. Start sign-in again.');
  if (prepared.row.phase === 'complete') {
    if (!Number.isFinite(cutoff(currentUser)) || cutoff(currentUser) < Number(prepared.row.revoked_before_ms)) throw unavailable();
    return receipt(prepared.row, uid, requestId);
  }
  if (!Number.isFinite(cutoff(currentUser)) || cutoff(currentUser) < Number(prepared.row.minimum_cutoff)) {
    if (Number(prepared.row.lease_until) <= Date.now()) throw new HttpsError('failed-precondition', 'This sign-out could not be confirmed. Sign in again before starting a new request.');
    throw unavailable();
  }
  const revokedBefore = cutoff(currentUser);
  const complete = await db.runTransaction(async tx => {
    const row = (await tx.get(ref)).data();
    if (!row || !sameAccount(row, currentUser) || row.request_hash !== requestHash) throw new HttpsError('failed-precondition', 'This sign-out request changed.');
    if (row.phase === 'complete') return row;
    if (row.phase !== 'calling' || !Array.isArray(row.targets)) throw unavailable();
    const targets = row.targets as Array<{ id: string; revision: string }>;
    const snaps = targets.length ? await tx.getAll(...targets.map(target => db.doc(`user_sessions/${target.id}`))) : [];
    let marked = 0;
    for (let i = 0; i < snaps.length; i++) {
      const snap = snaps[i], data = snap.data();
      // Never mark a session that was refreshed/replaced while Auth was in
      // flight; this list is bookkeeping, not per-device Firebase authority.
      if (data?.user_id === uid && data.revoked_at === null && revision(snap.updateTime) === targets[i].revision) {
        tx.update(snap.ref, { revoked_at: new Date(revokedBefore).toISOString(), trusted: false, pending_approval: false });
        marked++;
      }
    }
    const finished = { phase: 'complete', revoked_before_ms: revokedBefore, marked_count: marked, completed_at: Date.now() };
    tx.update(ref, finished);
    return { ...row, ...finished };
  });
  return receipt(complete, uid, requestId);
}
