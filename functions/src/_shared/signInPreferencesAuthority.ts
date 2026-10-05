import { createHash } from 'node:crypto';
import { Timestamp, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

type Row = Record<string, unknown>;
const fields = ['email_2fa_enabled', 'login_approvals_enabled'] as const;
export const signInCapabilities = Object.freeze({ enableEmailConfirmation: false, enableLoginApprovals: false });
export const securityRequestId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const isRow = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const revision = (snap: DocumentSnapshot) => snap.updateTime ? `${snap.updateTime.seconds}:${snap.updateTime.nanoseconds}` : 'missing';
function settings(row: Row | undefined, uid: string) {
  if (row?.user_id !== undefined && row.user_id !== uid) throw new HttpsError('failed-precondition', 'Your sign-in preferences need review. Please contact support.');
  for (const key of fields) if (row?.[key] !== undefined && typeof row[key] !== 'boolean') throw new HttpsError('failed-precondition', 'Your sign-in preferences could not be verified.');
  return { email_2fa_enabled: row?.email_2fa_enabled === true, login_approvals_enabled: row?.login_approvals_enabled === true };
}

/** These remain sign-in preferences, never an assertion of server-enforced MFA.
 * Enabling waits for the coordinated authority rollout. Existing flags can be
 * explicitly disabled without destroying other fields or concurrent changes. */
export async function manageSignInPreferences(db: Firestore, uid: string, raw: unknown) {
  if (!isRow(raw) || raw.expectedOwnerUid !== uid) throw new HttpsError('failed-precondition', 'Your account changed. Reopen security settings.');
  const input = raw;
  if (!['read', 'update'].includes(String(input.action)) || Object.keys(input).some(key => !['action', 'expectedOwnerUid', 'requestId', 'expectedRevision', 'patch'].includes(key))) throw new HttpsError('invalid-argument', 'Invalid sign-in preference request.');
  const ref = db.doc(`user_2fa_settings/${uid}`), quotaRef = db.doc(`_sign_in_preference_limits/${uid}`);
  const updating = input.action === 'update';
  let field: typeof fields[number] | undefined;
  if (updating) {
    if (!securityRequestId(input.requestId) || typeof input.expectedRevision !== 'string' || input.expectedRevision.length > 80 || !isRow(input.patch)
      || Object.keys(input.patch).length !== 1) throw new HttpsError('invalid-argument', 'Change one sign-in preference at a time.');
    field = fields.find(key => Object.hasOwn(input.patch as Row, key));
    if (!field || typeof input.patch[field] !== 'boolean') throw new HttpsError('invalid-argument', 'A true or false preference is required.');
    if (input.patch[field] === true) throw new HttpsError('failed-precondition', 'Enabling sign-in confirmation is not available yet. Your saved choice has not changed.');
  } else if (Object.keys(input).some(key => !['action', 'expectedOwnerUid'].includes(key))) throw new HttpsError('invalid-argument', 'Invalid sign-in preference read.');

  const receiptRef = updating ? db.doc(`_sign_in_preference_receipts/${uid}_${input.requestId}`) : null;
  const digest = updating ? createHash('sha256').update(JSON.stringify([uid, input.expectedRevision, field, false])).digest('hex') : null;
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref), saved = settings(snap.data(), uid);
    const prior = receiptRef ? (await tx.get(receiptRef)).data() : null;
    const quota = (await tx.get(quotaRef)).data(), now = Date.now();
    if (prior) {
      if (prior.owner_uid !== uid || prior.request_hash !== digest) throw new HttpsError('failed-precondition', 'This save request has already been used. Refresh security settings.');
      return;
    }
    const count = quota && quota.reset_at > now ? Number(quota.count) : 0;
    if (!Number.isSafeInteger(count) || count < 0 || count >= 60) throw new HttpsError('resource-exhausted', 'Too many settings requests. Please wait and retry.');
    if (updating && revision(snap) !== input.expectedRevision) throw new HttpsError('aborted', 'Your sign-in preferences changed. Refresh before saving.');
    tx.set(quotaRef, { count: count + 1, reset_at: count ? quota!.reset_at : now + 60_000, expireAt: Timestamp.fromMillis(now + 86400_000) });
    if (updating && field && receiptRef) {
      const patch = { user_id: uid, [field]: false, updated_at: new Date(now).toISOString() };
      // Missing documents need defaults only once; existing fields are never
      // copied out of a cached client row or overwritten by the other toggle.
      tx.set(ref, snap.exists ? patch : { ...saved, ...patch, created_at: new Date(now).toISOString() }, { merge: true });
      tx.create(receiptRef, { owner_uid: uid, request_hash: digest, field, value: false, created_at: now, expireAt: Timestamp.fromMillis(now + 7 * 86400_000) });
    }
  });
  const current = await ref.get(), currentSettings = settings(current.data(), uid);
  return { ok: true, ownerUid: uid, settings: currentSettings, revision: revision(current), capabilities: signInCapabilities,
    ...(updating ? { requestId: input.requestId, phase: current.exists && field && currentSettings[field] === false ? 'applied' : 'superseded' } : {}) };
}
