import type { Auth, UserRecord } from 'firebase-admin/auth';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { resolveIdentity, validAudienceId } from './profileAudienceAuthority.js';

export const parentalScopeFields = ['expectedOwnerUid', 'expectedProfileId', 'expectedAccountCreatedAt'];
export type ParentalActor = { uid: string; profileId: string; created: number; authTime: number; bindingRevision: string };
const changed = () => new HttpsError('failed-precondition', 'Your account changed. Reopen parental controls.');
export function parentalRequestIdentity(request: CallableRequest, raw: Record<string, unknown>): Omit<ParentalActor, 'bindingRevision'> {
  const uid = request.auth?.uid, authTime = request.auth?.token?.auth_time;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');
  if (raw.expectedOwnerUid !== uid || !validAudienceId(raw.expectedProfileId) || !Number.isSafeInteger(raw.expectedAccountCreatedAt) || Number(raw.expectedAccountCreatedAt) <= 0) throw changed();
  if (!Number.isSafeInteger(authTime) || Number(authTime) <= 0) throw new HttpsError('unauthenticated', 'Sign in again before managing parental controls.');
  return { uid, profileId: raw.expectedProfileId, created: Number(raw.expectedAccountCreatedAt), authTime: Number(authTime) };
}
export async function checkParentalAuth(auth: Pick<Auth, 'getUser'>, actor: Omit<ParentalActor, 'bindingRevision'>, now = Date.now()): Promise<UserRecord> {
  let user: UserRecord;
  try { user = await auth.getUser(actor.uid); }
  catch (error) { throw new HttpsError((error as { code?: string })?.code === 'auth/user-not-found' ? 'unauthenticated' : 'unavailable', 'Your account could not be verified. Sign in again or retry.'); }
  const created = Date.parse(user.metadata.creationTime), cutoff = user.tokensValidAfterTime === undefined ? 0 : Date.parse(user.tokensValidAfterTime);
  if (user.uid !== actor.uid || user.disabled || created !== actor.created) throw changed();
  if (!Number.isFinite(cutoff)) throw new HttpsError('unavailable', 'Your session could not be verified. Retry shortly.');
  if (actor.authTime * 1000 < cutoff || actor.authTime * 1000 < Math.floor(created / 1000) * 1000 || actor.authTime * 1000 > now + 1000) throw new HttpsError('unauthenticated', 'This session is no longer current. Sign in again.');
  return user;
}
export async function resolveParentalActor(db: Firestore, tx: Transaction, actor: Omit<ParentalActor, 'bindingRevision'>): Promise<ParentalActor> {
  const [identity, snapshot] = await Promise.all([resolveIdentity(db, tx, actor.uid), tx.get(db.doc(`_account_profile_bindings/${actor.uid}`))]);
  const binding = snapshot.data();
  if (!identity || identity.uid !== actor.uid || identity.profileId !== actor.profileId || binding?.version !== 1 || binding.owner_uid !== actor.uid
    || binding.profile_id !== actor.profileId || binding.auth_created_at_ms !== actor.created || binding.status !== 'active'
    || typeof binding.revision !== 'string' || !/^[a-f0-9]{48}$/.test(binding.revision)) throw changed();
  return { ...actor, bindingRevision: binding.revision };
}
export function parentalBinding(actor: ParentalActor) {
  return { authority_version: 1, profile_id: actor.profileId, auth_created_at_ms: actor.created, binding_revision: actor.bindingRevision };
}
/** A UID alone must not cause a previous account's controls to be adopted. */
export function checkParentalBinding(row: Record<string, unknown> | undefined, actor: ParentalActor) {
  if (!row) return;
  if (row.user_id !== actor.uid || row.authority_version !== 1 || row.profile_id !== actor.profileId || row.auth_created_at_ms !== actor.created || row.binding_revision !== actor.bindingRevision) {
    throw new HttpsError('failed-precondition', 'These existing parental controls need an ownership review. Your settings and PIN have not been changed.', { reason: 'parental-controls-review-required' });
  }
}

export async function readParentalRow(db: Firestore, tx: Transaction, actor: ParentalActor) {
  const refs = [...new Set([actor.uid, actor.profileId])].map(id => db.collection('parental_controls').doc(id));
  const [direct, owned] = await Promise.all([tx.getAll(...refs), tx.get(db.collection('parental_controls').where('user_id', 'in', [...new Set([actor.uid, actor.profileId])]).limit(3))]);
  if (direct.some(doc => doc.exists && doc.id !== actor.uid) || owned.docs.some(doc => doc.id !== actor.uid)) {
    throw new HttpsError('failed-precondition', 'These historical controls need a review. No additional PIN record was created.', { reason: 'parental-controls-review-required' });
  }
  const row = direct.find(doc => doc.id === actor.uid)?.data();
  checkParentalBinding(row, actor);
  return row;
}
