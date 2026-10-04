import { createHash } from 'node:crypto';
import type { Auth, UserRecord } from 'firebase-admin/auth';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, validAudienceId, type AudienceIdentity, type AudienceRow } from './profileAudienceAuthority.js';

export const CONTACT_BATCH_LIMIT = 200;
const hashPattern = /^[a-f0-9]{64}$/;
export const hashPhoneE164Server = (phone: string) => createHash('sha256').update(phone).digest('hex');
const verifiedPhone = (user: UserRecord) => !user.disabled && /^\+[1-9]\d{7,14}$/.test(user.phoneNumber || '') ? user.phoneNumber! : null;
const proofValid = (row: AudienceRow | undefined, uid: string, profileId: string, hash: string) => row?.version === 1
  && row.owner_uid === uid && row.owner_profile_id === profileId && row.phone_hash === hash;
const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : null;

function requestData(raw: unknown, uid: string) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpsError('invalid-argument', 'Contact details are required.');
  const data = raw as AudienceRow;
  if (data.expectedOwnerUid !== uid) throw new HttpsError('failed-precondition', 'Your account changed. Reopen contacts.');
  if (!validAudienceId(data.expectedProfileId) || !['state', 'setDiscoverable', 'match'].includes(String(data.action))) throw new HttpsError('invalid-argument', 'A valid contact action and profile are required.');
  const allowed = ['action', 'expectedOwnerUid', 'expectedProfileId', ...(data.action === 'match' ? ['hashes'] : data.action === 'setDiscoverable' ? ['discoverable'] : [])];
  if (Object.keys(data).some(key => !allowed.includes(key))) throw new HttpsError('invalid-argument', 'Unexpected contact details.');
  if (data.action === 'setDiscoverable' && typeof data.discoverable !== 'boolean') throw new HttpsError('invalid-argument', 'Choose whether friends can find you.');
  if (data.action === 'match' && (!Array.isArray(data.hashes) || data.hashes.length > CONTACT_BATCH_LIMIT
    || data.hashes.some(hash => typeof hash !== 'string' || !hashPattern.test(hash)))) throw new HttpsError('invalid-argument', 'Choose up to 200 valid contact hashes per request.');
  return { action: data.action as 'state' | 'setDiscoverable' | 'match', profileId: data.expectedProfileId,
    discoverable: data.discoverable === true, hashes: data.action === 'match' ? [...new Set(data.hashes as string[])] : [] };
}

async function currentActor(db: Firestore, tx: Transaction, uid: string, profileId: string) {
  const actor = await resolveIdentity(db, tx, uid);
  if (!actor || actor.uid !== uid || actor.profileId !== profileId) throw new HttpsError('failed-precondition', 'Your profile identity changed. Refresh and retry.');
  return actor;
}

/** The quota stores counts only, never an uploaded address book or its hashes. */
async function charge(db: Firestore, tx: Transaction, uid: string, action: string, hashCount: number) {
  const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
  const ref = db.collection('_contact_discovery_limits').doc(uid), snap = await tx.get(ref), old = snap.data() || {};
  const sameDay = old.day === day, sameWindow = Number.isFinite(old.window_started_at) && old.window_started_at > now - 60_000;
  const requests = (sameWindow ? Number(old.requests) || 0 : 0) + 1;
  const hashes = (sameDay ? Number(old.hashes) || 0 : 0) + hashCount;
  const matches = (sameDay ? Number(old.matches) || 0 : 0) + (action === 'match' ? 1 : 0);
  if (requests > 30 || hashes > 2000 || matches > 50) throw new HttpsError('resource-exhausted', 'Contact search limit reached. Try again later; daily limits reset at midnight UTC.');
  return () => tx.set(ref, { day, requests, hashes, matches, window_started_at: sameWindow ? old.window_started_at : now });
}

function state(uid: string, actor: AudienceIdentity, phone: string | null, row: AudienceRow | undefined, index: AudienceRow | undefined) {
  const hash = phone ? hashPhoneE164Server(phone) : null;
  return { success: true as const, ownerUid: uid, profileId: actor.profileId, eligible: !!phone,
    discoverable: !!hash && proofValid(row, uid, actor.profileId, hash) && row?.discoverable === true && proofValid(index, uid, actor.profileId, hash),
    maskedPhone: phone ? `+•••${phone.slice(-4)}` : null,
    legacyPhoneNeedsVerification: !phone && (actor.row.phone_verified === true || typeof actor.row.phone_number === 'string' || typeof actor.row.phone_e164_sha256 === 'string') };
}

export async function contactDiscovery(db: Firestore, auth: Pick<Auth, 'getUser' | 'getUsers'>, uid: string, raw: unknown) {
  const input = requestData(raw, uid);
  let authUser: UserRecord;
  try { authUser = await auth.getUser(uid); } catch (error) {
    if ((error as { code?: string }).code === 'auth/user-not-found') throw new HttpsError('unauthenticated', 'Sign in again to use contacts.');
    throw error;
  }
  if (authUser.disabled) throw new HttpsError('permission-denied', 'This account is unavailable.');
  const phone = verifiedPhone(authUser), hash = phone ? hashPhoneE164Server(phone) : null;
  const ownRef = db.collection('_contact_discovery').doc(uid);
  const initial = await db.runTransaction(async tx => {
    const actor = await currentActor(db, tx, uid, input.profileId);
    const saveQuota = await charge(db, tx, uid, input.action, input.hashes.length);
    const own = (await tx.get(ownRef)).data();
    const oldHash = typeof own?.phone_hash === 'string' && hashPattern.test(own.phone_hash) ? own.phone_hash : null;
    const oldIndex = oldHash ? await tx.get(db.collection('_contact_discovery_phones').doc(oldHash)) : null;
    const currentIndex = hash ? (oldHash === hash ? oldIndex : await tx.get(db.collection('_contact_discovery_phones').doc(hash))) : null;
    if (input.action === 'setDiscoverable') {
      if (input.discoverable && !phone) throw new HttpsError('failed-precondition', 'Your phone is not eligible for discovery yet. An existing SMS profile verification is not a Firebase-linked phone.');
      // An old owner must never remove the index now held by a recycled number's new owner.
      if (oldIndex?.data()?.owner_uid === uid) tx.delete(oldIndex.ref);
      const proof = { version: 1, owner_uid: uid, owner_profile_id: actor.profileId, phone_hash: input.discoverable ? hash : null };
      tx.set(ownRef, { ...proof, discoverable: input.discoverable, updated_at: new Date().toISOString() });
      if (input.discoverable) tx.set(db.collection('_contact_discovery_phones').doc(hash!), proof);
      saveQuota();
      return state(uid, actor, phone, { ...proof, discoverable: input.discoverable }, input.discoverable ? proof : undefined);
    }
    saveQuota();
    return state(uid, actor, phone, own, currentIndex?.data());
  });
  if (input.action !== 'match') return initial;
  if (!input.hashes.length) return { success: true as const, ownerUid: uid, profileId: input.profileId, matches: [] };

  const indexes = await db.getAll(...input.hashes.map(value => db.collection('_contact_discovery_phones').doc(value)));
  const candidates = indexes.filter(doc => {
    const row = doc.data();
    return validAudienceId(row?.owner_uid) && row.owner_uid !== uid && validAudienceId(row.owner_profile_id)
      && proofValid(row, row.owner_uid, row.owner_profile_id, doc.id);
  });
  const users = new Map<string, UserRecord>();
  const ids = [...new Set(candidates.map(doc => doc.data()!.owner_uid as string))];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const current = await auth.getUsers(ids.slice(offset, offset + 100).map(candidateUid => ({ uid: candidateUid })));
    for (const user of current.users) users.set(user.uid, user);
  }
  const matches: Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null; is_verified: boolean; phone_hash: string }> = [];
  // Bound simultaneous identity/block reads even for a fully matched address book.
  for (let offset = 0; offset < candidates.length; offset += 10) {
    const page = await Promise.all(candidates.slice(offset, offset + 10).map(async index => {
      const candidateUid = index.data()!.owner_uid as string, user = users.get(candidateUid), currentPhone = user ? verifiedPhone(user) : null;
      if (!currentPhone || hashPhoneE164Server(currentPhone) !== index.id) return null;
      return db.runTransaction(async tx => {
        const [viewer, target] = await Promise.all([currentActor(db, tx, uid, input.profileId), resolveIdentity(db, tx, candidateUid)]);
        if (!target || target.uid !== candidateUid || target.profileId !== index.data()!.owner_profile_id) return null;
        const [proof, currentIndex, outgoingBlock, incomingBlock] = await Promise.all([
          tx.get(db.collection('_contact_discovery').doc(candidateUid)), tx.get(index.ref),
          tx.get(db.collection('blocked_users').where('blocker_id', 'in', viewer.aliases).where('blocked_id', 'in', target.aliases).limit(1)),
          tx.get(db.collection('blocked_users').where('blocker_id', 'in', target.aliases).where('blocked_id', 'in', viewer.aliases).limit(1)),
        ]);
        if (!proofValid(proof.data(), candidateUid, target.profileId, index.id) || proof.data()?.discoverable !== true
          || !proofValid(currentIndex.data(), candidateUid, target.profileId, index.id) || !outgoingBlock.empty || !incomingBlock.empty) return null;
        return { id: target.profileId, username: text(target.row.username, 100) || '', display_name: text(target.row.display_name, 150),
          avatar_url: text(target.row.avatar_url, 2048), is_verified: target.row.is_verified === true, phone_hash: index.id };
      });
    }));
    for (const match of page) if (match && !matches.some(row => row.id === match.id)) matches.push(match);
  }
  return { success: true as const, ownerUid: uid, profileId: input.profileId, matches };
}
