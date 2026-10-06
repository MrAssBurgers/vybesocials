import type { Auth, UserRecord } from 'firebase-admin/auth';
import type { Firestore, Transaction, DocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { resolveParentalActor, parentalBinding, type ParentalActor } from './parentalAccountAuthority.js';

type Row = Record<string, unknown>;
type AdminAuth = Pick<Auth, 'getUser'>;
export type ParentalRecoveryPlan = { version: 1; status: 'review-required'; review_id: string; review_case: string;
  target_uid: string; profile_id: string; auth_created_at_ms: number; binding_revision: string; source_id: string;
  source_create_time: string; source_update_time: string; source_fingerprint: string };
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');
const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const denied = () => new HttpsError('failed-precondition', 'Recovery evidence changed or conflicts with another record. Nothing was changed.');
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    if (typeof (value as { toJSON?: unknown }).toJSON === 'function') return canonical((value as { toJSON: () => unknown }).toJSON());
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const stableResult = (row: Row) => fingerprint(Object.fromEntries(Object.entries(row).filter(([key]) => !['pin_failures', 'pin_lock_until'].includes(key))));
// Keep Firestore nanoseconds: millisecond rounding could miss an intervening same-value write.
const exactTime = (stamp: DocumentSnapshot['createTime']) => stamp?.toDate().toISOString().replace(/\.\d{3}Z$/, `.${String(stamp.nanoseconds).padStart(9, '0')}Z`);
const version = (snapshot: DocumentSnapshot) => ({ create: exactTime(snapshot.createTime), update: exactTime(snapshot.updateTime) });
async function owner(auth: AdminAuth, uid: string, expected?: number): Promise<UserRecord> {
  const user = await auth.getUser(uid), created = Date.parse(user.metadata.creationTime);
  if (user.uid !== uid || user.disabled || !Number.isSafeInteger(created) || created <= 0 || expected !== undefined && expected !== created) throw denied();
  return user;
}
async function reviewer(auth: AdminAuth, uid: string, expectedCreated?: number) {
  if (!id(uid)) throw new HttpsError('permission-denied', 'A current authorized reviewer is required.');
  const user = await auth.getUser(uid);
  const created = Date.parse(user.metadata.creationTime);
  if (user.uid !== uid || user.disabled || user.customClaims?.admin !== true || !Number.isSafeInteger(created) || created <= 0
    || expectedCreated !== undefined && created !== expectedCreated) throw new HttpsError('permission-denied', 'A current authorized reviewer is required.');
  return created;
}
async function absentPreviousOwner(auth: AdminAuth, previous: string, current: string) {
  if (previous === current) return;
  try { await auth.getUser(previous); throw denied(); }
  catch (error) { if ((error as { code?: string }).code !== 'auth/user-not-found') throw error; }
}
function validSource(row: Row) {
  if (!id(row.user_id) || typeof row.pin_salt !== 'string' || !/^[a-f0-9]{32,64}$/.test(row.pin_salt)
    || typeof row.pin_hash !== 'string' || !/^[a-f0-9]{64}$/.test(row.pin_hash) || ![undefined, 'sha256-v1', 'scrypt-v2'].includes(row.pin_algo as string | undefined)
    || row.is_active !== undefined && typeof row.is_active !== 'boolean'
    || row.content_filter_level !== undefined && !['protected', 'moderate', 'unrestricted'].includes(row.content_filter_level as string)
    || row.max_screen_time_minutes !== undefined && row.max_screen_time_minutes !== null && (!Number.isInteger(row.max_screen_time_minutes) || Number(row.max_screen_time_minutes) < 1 || Number(row.max_screen_time_minutes) > 1440)
    || !Number.isSafeInteger(row.pin_failures ?? 0) || Number(row.pin_failures ?? 0) < 0 || Number(row.pin_failures ?? 0) > 5
    || !Number.isSafeInteger(row.pin_lock_until ?? 0) || Number(row.pin_lock_until ?? 0) < 0) throw denied();
}
async function source(database: Firestore, auth: AdminAuth, tx: Transaction, actor: ParentalActor, sourceId: string) {
  const collection = database.collection('parental_controls');
  const initial = await tx.get(collection.doc(sourceId)), row = initial.data();
  if (!row) throw denied(); validSource(row);
  const previous = row.user_id as string;
  if (![actor.uid, actor.profileId].includes(previous)) {
    const retired = (await tx.get(database.doc(`_account_profile_bindings/${previous}`))).data();
    if (retired?.version !== 1 || retired.owner_uid !== previous || retired.status !== 'retired' || retired.profile_id !== actor.profileId || retired.transferred_to_uid !== actor.uid) throw denied();
  }
  await absentPreviousOwner(auth, previous, actor.uid);
  const [direct, related] = await Promise.all([tx.getAll(collection.doc(actor.uid), collection.doc(actor.profileId)),
    tx.get(collection.where('user_id', 'in', [...new Set([actor.uid, actor.profileId, previous])]).limit(3))]);
  const records = new Map<string, DocumentSnapshot>(related.docs.map(doc => [doc.id, doc])); for (const doc of direct) if (doc.exists) records.set(doc.id, doc);
  records.set(initial.id, initial);
  if (records.size !== 1) throw denied();
  if (row.authority_version === 1 && row.user_id === actor.uid && row.profile_id === actor.profileId && row.auth_created_at_ms === actor.created && row.binding_revision === actor.bindingRevision) throw new HttpsError('already-exists', 'These controls are already bound to the current account. Use the normal PIN unlock.');
  const stamp = version(initial); if (!stamp.create || !stamp.update) throw denied();
  return { snapshot: initial, row, stamp };
}
function validatePlan(plan: ParentalRecoveryPlan) {
  const keys = ['version', 'status', 'review_id', 'review_case', 'target_uid', 'profile_id', 'auth_created_at_ms', 'binding_revision', 'source_id', 'source_create_time', 'source_update_time', 'source_fingerprint'];
  if (!plan || typeof plan !== 'object' || Object.keys(plan).length !== keys.length || Object.keys(plan).some(key => !keys.includes(key))
    || plan.version !== 1 || plan.status !== 'review-required' || !uuid(plan.review_id) || typeof plan.review_case !== 'string' || !plan.review_case.trim() || plan.review_case.length > 200
    || !id(plan.target_uid) || !id(plan.profile_id) || !id(plan.source_id) || !Number.isSafeInteger(plan.auth_created_at_ms) || plan.auth_created_at_ms <= 0
    || !/^[a-f0-9]{48}$/.test(plan.binding_revision) || !/^[a-f0-9]{64}$/.test(plan.source_fingerprint)
    || ![plan.source_create_time, plan.source_update_time].every(stamp => typeof stamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{9}Z$/.test(stamp) && Number.isFinite(Date.parse(stamp)))) throw denied();
}
/** Trusted Admin SDK operator helper, never a callable. Preparation is read-only
 * and is not evidence that historical ownership has been independently reviewed. */
export async function prepareParentalRecovery(database: Firestore, auth: AdminAuth, uid: string, profileId: string, sourceId: string, reviewCase: string): Promise<ParentalRecoveryPlan> {
  if (![uid, profileId, sourceId].every(id) || typeof reviewCase !== 'string' || !reviewCase.trim() || reviewCase.length > 200) throw denied();
  const user = await owner(auth, uid), created = Date.parse(user.metadata.creationTime);
  return database.runTransaction(async tx => {
    // authTime is unused by identity resolution. This is trusted operator work,
    // not a fabricated callable token or an additional-factor admission check.
    const actor = await resolveParentalActor(database, tx, { uid, profileId, created, authTime: 0 });
    const original = await source(database, auth, tx, actor, sourceId); await owner(auth, uid, created);
    await absentPreviousOwner(auth, original.row.user_id as string, uid);
    return { version: 1, status: 'review-required', review_id: randomUUID(), review_case: reviewCase, target_uid: uid, profile_id: profileId,
      auth_created_at_ms: created, binding_revision: actor.bindingRevision, source_id: sourceId, source_create_time: original.stamp.create!,
      source_update_time: original.stamp.update!, source_fingerprint: fingerprint(original.row) };
  });
}
/** Call only after independent ownership review, using trusted Admin SDK credentials.
 * Binds the original PIN unchanged, archives every source field, and records a
 * durable receipt. It never grants admin claims or accepts client approval. */
export async function applyReviewedParentalRecovery(database: Firestore, auth: AdminAuth, plan: ParentalRecoveryPlan, reviewedBy: string, confirmedCase: string) {
  validatePlan(plan); if (confirmedCase !== plan.review_case) throw denied(); const reviewerCreated = await reviewer(auth, reviewedBy);
  await owner(auth, plan.target_uid, plan.auth_created_at_ms);
  const receiptId = fingerprint([plan.target_uid, plan.auth_created_at_ms, plan.review_id]);
  const receiptRef = database.doc(`_parental_recovery_receipts/${receiptId}`), archiveRef = database.doc(`_parental_controls_archive/${receiptId}`);
  const revision = randomBytes(24).toString('hex');
  return database.runTransaction(async tx => {
    const actor = await resolveParentalActor(database, tx, { uid: plan.target_uid, profileId: plan.profile_id, created: plan.auth_created_at_ms, authTime: 0 });
    if (actor.bindingRevision !== plan.binding_revision) throw denied();
    const [receiptDoc, archiveDoc, targetDoc] = await tx.getAll(receiptRef, archiveRef, database.doc(`parental_controls/${actor.uid}`));
    const receipt = receiptDoc.data(), target = targetDoc.data(), archived = archiveDoc.data();
    if (receipt) {
      if (receipt.version !== 1 || receipt.plan_fingerprint !== fingerprint(plan) || receipt.reviewed_by !== reviewedBy || receipt.reviewer_auth_created_at_ms !== reviewerCreated || archived?.version !== 1 || archived.review_id !== plan.review_id || archived.review_case !== plan.review_case
        || archived.target_uid !== actor.uid || archived.profile_id !== actor.profileId || archived.auth_created_at_ms !== actor.created
        || archived.source_fingerprint !== plan.source_fingerprint || fingerprint(archived.source_row) !== plan.source_fingerprint
        || !target || target.control_revision !== receipt.control_revision || target.user_id !== actor.uid || target.profile_id !== actor.profileId
        || target.auth_created_at_ms !== actor.created || target.binding_revision !== actor.bindingRevision || stableResult(target) !== receipt.result_fingerprint) throw denied();
      await owner(auth, actor.uid, actor.created); await reviewer(auth, reviewedBy, reviewerCreated);
      return { ok: true, replayed: true };
    }
    if (archiveDoc.exists) throw denied();
    const original = await source(database, auth, tx, actor, plan.source_id);
    if (original.stamp.create !== plan.source_create_time || original.stamp.update !== plan.source_update_time || fingerprint(original.row) !== plan.source_fingerprint) throw denied();
    await owner(auth, actor.uid, actor.created); await reviewer(auth, reviewedBy, reviewerCreated);
    await absentPreviousOwner(auth, original.row.user_id as string, actor.uid);
    const now = Date.now(), merged = { ...original.row, ...parentalBinding(actor), user_id: actor.uid, control_revision: revision };
    tx.create(archiveRef, { version: 1, review_id: plan.review_id, review_case: plan.review_case, reviewed_by: reviewedBy, reviewer_auth_created_at_ms: reviewerCreated, target_uid: actor.uid,
      profile_id: actor.profileId, auth_created_at_ms: actor.created, binding_revision: actor.bindingRevision, source_id: plan.source_id,
      source_create_time: plan.source_create_time, source_update_time: plan.source_update_time, source_fingerprint: plan.source_fingerprint, source_row: original.row, recovered_at_ms: now });
    tx.set(database.doc(`parental_controls/${actor.uid}`), merged);
    if (plan.source_id !== actor.uid) tx.delete(original.snapshot.ref);
    tx.create(receiptRef, { version: 1, plan_fingerprint: fingerprint(plan), reviewed_by: reviewedBy, reviewer_auth_created_at_ms: reviewerCreated, control_revision: revision,
      result_fingerprint: stableResult(merged), completed_at_ms: now });
    return { ok: true, replayed: false };
  });
}
