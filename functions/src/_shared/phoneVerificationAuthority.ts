import type { Auth, UserRecord } from 'firebase-admin/auth';
import { randomUUID } from 'node:crypto';
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, validAudienceId } from './profileAudienceAuthority.js';

type Row = Record<string, unknown>;
type PhoneAuth = Pick<Auth, 'getUser' | 'getUserByPhoneNumber' | 'updateUser'>;
export interface PhoneProvider { start(phone: string): Promise<void>; check(phone: string, code: string): Promise<boolean> }
const phonePattern = /^\+[1-9]\d{7,14}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const verifiedAuthPhone = (user: UserRecord) => !user.disabled && phonePattern.test(user.phoneNumber || '') ? user.phoneNumber! : null;
const masked = (phone: string | null) => phone ? `+•••${phone.slice(-4)}` : null;
const codeOf = (error: unknown) => (error as { code?: string })?.code;
function inputFor(raw: unknown, uid: string, extras: string[]) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpsError('invalid-argument', 'Phone details are required.');
  const input = raw as Row;
  if (input.expectedOwnerUid !== uid) throw new HttpsError('failed-precondition', 'Your account changed. Reopen phone settings.');
  if (!validAudienceId(input.expectedProfileId) || Object.keys(input).some(key => !['expectedOwnerUid', 'expectedProfileId', ...extras].includes(key))) throw new HttpsError('invalid-argument', 'Invalid phone details.');
  return input;
}
async function activeUser(auth: PhoneAuth, uid: string) {
  let user: UserRecord;
  try { user = await auth.getUser(uid); } catch (error) {
    if (codeOf(error) === 'auth/user-not-found') throw new HttpsError('unauthenticated', 'Sign in again to verify your phone.');
    throw new HttpsError('unavailable', 'Phone verification is unavailable. Please retry.');
  }
  if (user.disabled) throw new HttpsError('permission-denied', 'This account cannot verify a phone.');
  return user;
}
async function actor(db: Firestore, tx: Transaction, uid: string, input: Row) {
  const identity = await resolveIdentity(db, tx, uid);
  if (!identity || identity.uid !== uid || identity.profileId !== input.expectedProfileId) throw new HttpsError('failed-precondition', 'Your profile changed. Refresh and retry.');
  return identity;
}
async function quota(db: Firestore, tx: Transaction, uid: string, kind: 'state' | 'send' | 'confirm', now: number) {
  const ref = db.doc(`_phone_verification_limits/${uid}`), snap = await tx.get(ref), old = snap.data() || {};
  const duration = kind === 'state' ? 60_000 : 600_000, limit = kind === 'state' ? 30 : kind === 'send' ? 3 : 10;
  const fresh = Number(old[`${kind}_at`]) + duration > now;
  const count = fresh ? Number(old[`${kind}_count`]) || 0 : 0;
  if (count >= limit) throw new HttpsError('resource-exhausted', 'Too many attempts. Please wait before trying again.');
  return () => tx.set(ref, { [`${kind}_at`]: fresh ? old[`${kind}_at`] : now, [`${kind}_count`]: count + 1 }, { merge: true });
}
function matches(row: Row | undefined, uid: string, profileId: unknown, challengeId: unknown, user: UserRecord) {
  return row?.version === 1 && row.owner_uid === uid && row.profile_id === profileId && row.challenge_id === challengeId
    && row.auth_created_at === user.metadata.creationTime && typeof row.phone === 'string' && phonePattern.test(row.phone);
}
async function availablePhone(auth: PhoneAuth, uid: string, phone: string) {
  try {
    const owner = await auth.getUserByPhoneNumber(phone);
    if (owner.uid !== uid) throw new HttpsError('already-exists', 'That number is already linked to another account.');
  } catch (error) {
    if (codeOf(error) === 'auth/user-not-found') return;
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('unavailable', 'Phone verification is unavailable. Please retry.');
  }
}

/** Only Firebase Auth owns the verification flag. Public profile fields are never proof. */
export async function readPhoneVerification(db: Firestore, auth: PhoneAuth, uid: string, raw: unknown) {
  const input = inputFor(raw, uid, []), user = await activeUser(auth, uid), phone = verifiedAuthPhone(user);
  return db.runTransaction(async tx => {
    const owner = await actor(db, tx, uid, input), applyQuota = await quota(db, tx, uid, 'state', Date.now());
    applyQuota();
    return { ok: true, ownerUid: uid, profileId: owner.profileId, verified: !!phone, maskedPhone: masked(phone),
      legacyPhoneNeedsVerification: !phone && !!(owner.row.phone_verified || owner.row.phone_number || owner.row.phone_e164_sha256) };
  });
}

export async function requestPhoneVerification(db: Firestore, auth: PhoneAuth, provider: PhoneProvider, uid: string, raw: unknown) {
  const input = inputFor(raw, uid, ['phone', 'requestId']);
  if (typeof input.phone !== 'string' || !phonePattern.test(input.phone) || typeof input.requestId !== 'string' || !uuidPattern.test(input.requestId)) throw new HttpsError('invalid-argument', 'Enter a valid international phone number.');
  const phone = input.phone, challengeId = input.requestId, user = await activeUser(auth, uid), now = Date.now();
  const ref = db.doc(`_phone_verifications/${uid}`);
  const prepared = await db.runTransaction(async tx => {
    const owner = await actor(db, tx, uid, input), snap = await tx.get(ref), old = snap.data();
    if (old?.status === 'linking' && (Number(old.link_until) > now || Number(old.expires_at) > now || user.phoneNumber === old.phone)) throw new HttpsError('failed-precondition', 'Finish verifying the current code before requesting another.');
    const same = matches(old, uid, owner.profileId, challengeId, user);
    if (same && old!.phone !== phone) throw new HttpsError('failed-precondition', 'This request belongs to another phone number.');
    if (same && Number(old!.expires_at) > now && old!.status === 'pending') return { send: false, expiresAt: Number(old!.expires_at), profileId: owner.profileId };
    if (same && old!.status === 'linked') throw new HttpsError('failed-precondition', 'This phone request is already complete. Refresh your phone settings.');
    if (old?.status === 'sending' && Number(old.started_at) + 30_000 > now) throw new HttpsError('unavailable', 'A code is being sent. Wait a moment and retry.');
    const applyQuota = await quota(db, tx, uid, 'send', now), expiresAt = now + 600_000;
    applyQuota();
    tx.set(ref, { version: 1, owner_uid: uid, profile_id: owner.profileId, challenge_id: challengeId, phone,
      auth_created_at: user.metadata.creationTime, previous_phone: user.phoneNumber || null, status: 'sending', started_at: now, expires_at: expiresAt });
    return { send: true, expiresAt, profileId: owner.profileId };
  });
  if (prepared.send) {
    try { await availablePhone(auth, uid, phone); await provider.start(phone); } catch (error) {
      await db.runTransaction(async tx => { const row = (await tx.get(ref)).data(); if (row?.challenge_id === challengeId && row.status === 'sending') tx.update(ref, { status: 'failed', phone: FieldValue.delete() }); });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('unavailable', 'Could not send the code. Please retry.');
    }
    await db.runTransaction(async tx => {
      await actor(db, tx, uid, input);
      const row = (await tx.get(ref)).data();
      if (!matches(row, uid, prepared.profileId, challengeId, user) || row!.status !== 'sending') throw new HttpsError('aborted', 'The phone request changed. Request a new code.');
      tx.update(ref, { status: 'pending' });
    });
  }
  return { ok: true, ownerUid: uid, profileId: prepared.profileId, challengeId, maskedPhone: masked(phone), expiresAt: prepared.expiresAt };
}

export async function confirmPhoneVerification(db: Firestore, auth: PhoneAuth, provider: PhoneProvider, uid: string, raw: unknown) {
  const input = inputFor(raw, uid, ['challengeId', 'code']);
  if (typeof input.challengeId !== 'string' || !uuidPattern.test(input.challengeId) || typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) throw new HttpsError('invalid-argument', 'Enter the six-digit code.');
  let user = await activeUser(auth, uid);
  const ref = db.doc(`_phone_verifications/${uid}`);
  const challenge = await db.runTransaction(async tx => {
    await actor(db, tx, uid, input);
    const row = (await tx.get(ref)).data();
    if (!matches(row, uid, input.expectedProfileId, input.challengeId, user) || !['pending', 'linking', 'linked'].includes(String(row!.status))) throw new HttpsError('permission-denied', 'This code request is no longer available.');
    if (Number(row!.expires_at) <= Date.now() && !(['linking', 'linked'].includes(String(row!.status)) && user.phoneNumber === row!.phone)) throw new HttpsError('failed-precondition', 'The code expired. Request a new one.');
    if (row!.status === 'linking' && Number(row!.link_until) > Date.now()) throw new HttpsError('unavailable', 'Your phone link is being confirmed. Wait a moment, then retry Verify.');
    const applyQuota = await quota(db, tx, uid, 'confirm', Date.now()); applyQuota();
    return row!;
  });
  const phone = challenge.phone as string;
  const rejectChangedPhone = async (current: UserRecord) => {
    if (challenge.status === 'linked' || current.phoneNumber === phone || (current.phoneNumber || null) === challenge.previous_phone) return;
    await db.runTransaction(async tx => {
      const row = (await tx.get(ref)).data();
      if (row && row.challenge_id === input.challengeId && row.phone === phone && (row.status === 'pending' || (row.status === 'linking' && Number(row.link_until) <= Date.now()))) tx.update(ref, { status: 'failed', phone: FieldValue.delete(), link_id: FieldValue.delete(), link_until: FieldValue.delete() });
    });
    throw new HttpsError('failed-precondition', 'Your phone changed. Request a new verification code.');
  };
  await rejectChangedPhone(user);
  if (challenge.status === 'pending') {
    let approved = false;
    try { approved = await provider.check(phone, input.code); } catch { throw new HttpsError('unavailable', 'Could not check the code. Please retry.'); }
    if (!approved) throw new HttpsError('permission-denied', 'Incorrect code. Please try again.');
  }
  user = await activeUser(auth, uid);
  await rejectChangedPhone(user);
  const leaseId = randomUUID();
  const completed = await db.runTransaction(async tx => {
    await actor(db, tx, uid, input);
    const row = (await tx.get(ref)).data();
    if (!matches(row, uid, input.expectedProfileId, input.challengeId, user) || row!.phone !== phone
      || !['pending', 'linking', 'linked'].includes(String(row!.status))) throw new HttpsError('aborted', 'The phone request changed. Request a new code.');
    if (row!.status === 'linked') return true;
    if (row!.status === 'linking' && Number(row!.link_until) > Date.now()) throw new HttpsError('unavailable', 'Your phone link is being confirmed. Wait a moment, then retry Verify.');
    if (Number(row!.expires_at) <= Date.now() && user.phoneNumber !== phone) throw new HttpsError('failed-precondition', 'The code expired. Request a new one.');
    // Only one worker can update Auth. The lease exceeds the callable's 60s deadline.
    tx.update(ref, { status: 'linking', link_id: leaseId, link_until: Date.now() + 120_000 });
    return false;
  });
  if (user.metadata.creationTime !== challenge.auth_created_at) throw new HttpsError('failed-precondition', 'Your account changed. Sign in again.');
  if (completed && user.phoneNumber !== phone) throw new HttpsError('failed-precondition', 'Your phone changed since this verification. Refresh your phone settings.');
  if (user.phoneNumber !== phone) {
    if ((user.phoneNumber || null) !== challenge.previous_phone) throw new HttpsError('failed-precondition', 'Your phone changed. Refresh your phone settings.');
    try { await auth.updateUser(uid, { phoneNumber: phone }); } catch (error) {
      if (codeOf(error) === 'auth/phone-number-already-exists') {
        await db.runTransaction(async tx => { const row = (await tx.get(ref)).data(); if (row && row.challenge_id === input.challengeId && row.status === 'linking') tx.update(ref, { status: 'failed', phone: FieldValue.delete() }); });
        throw new HttpsError('already-exists', 'That number is already linked to another account.');
      }
      // Keep the verified receipt: an Auth write can succeed while its response is lost.
      throw new HttpsError('unavailable', 'Could not confirm the phone link. Retry Verify with the same code.');
    }
  }
  user = await activeUser(auth, uid);
  if (verifiedAuthPhone(user) !== phone) throw new HttpsError('unavailable', 'The phone link was not confirmed. Please retry.');
  await db.runTransaction(async tx => {
    const owner = await actor(db, tx, uid, input), row = (await tx.get(ref)).data();
    if (!matches(row, uid, owner.profileId, input.challengeId, user) || row!.phone !== phone || (row!.status !== 'linked' && (row!.status !== 'linking' || row!.link_id !== leaseId))) throw new HttpsError('aborted', 'The phone request changed. Refresh your phone settings.');
    tx.update(ref, { status: 'linked', link_id: FieldValue.delete(), link_until: FieldValue.delete() });
    // Remove only this verified owner's obsolete public fields; no alias profile is created.
    tx.update(db.doc(`profiles/${owner.profileId}`), { phone_number: FieldValue.delete(), phone_verified: FieldValue.delete(), phone_e164_sha256: FieldValue.delete() });
  });
  return { ok: true, ownerUid: uid, profileId: input.expectedProfileId, verified: true, phone };
}
