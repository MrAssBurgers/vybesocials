import type { UserRecord } from 'firebase-admin/auth';
import type { Firestore, Transaction, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

export type EmailDeviceConfirmation = { challengeId: string; secretVersion: string; publicVersion: string };
const version = (value: Timestamp | undefined) => value ? `${value.seconds}:${value.nanoseconds}` : 'missing';
export const emailCompletionId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
export const invalidEmailCompletion = () => new HttpsError('failed-precondition', 'This email confirmation is no longer current. Please sign in again.');

/** The method name is never proof. Only a verified Firebase token claim and
 * the consumed server-private challenge can finish this additional email gate. */
export async function readEmailDeviceConfirmation(db: Firestore, tx: Transaction, account: UserRecord, authTime: number, challengeId: string, now: number): Promise<EmailDeviceConfirmation> {
  const [publicSnapshot, secretSnapshot] = await tx.getAll(db.doc(`auth_challenges/${challengeId}`), db.doc(`_auth_email_challenges/${challengeId}`));
  const row = publicSnapshot.data(), secret = secretSnapshot.data(), consumed = secret?.consumed_at;
  if (!account.email || !secret || secret.version !== 1 || secret.status !== 'consumed'
    || secret.owner_uid !== account.uid || secret.email !== account.email || secret.auth_created_at !== account.metadata.creationTime
    || !Number.isSafeInteger(consumed) || consumed <= 0 || consumed > now + 1000 || now - consumed > 10 * 60_000
    || authTime * 1000 < Math.floor(consumed / 1000) * 1000 || authTime * 1000 > consumed + 10 * 60_000
    || typeof secret.expires_at !== 'number' || secret.expires_at <= consumed
    || typeof secret.revision !== 'string' || !/^[a-f0-9]{48}$/.test(secret.revision)
    || !row || row.user_id !== account.uid || row.status !== 'approved' || row.channel !== 'email'
    || !['email_2fa', 'login_approval'].includes(row.challenge_type) || row.email_revision !== secret.revision
    || row.metadata?.switched_to !== 'email_code') throw invalidEmailCompletion();
  return { challengeId, secretVersion: version(secretSnapshot.updateTime), publicVersion: version(publicSnapshot.updateTime) };
}

export function sameEmailDeviceConfirmation(left: EmailDeviceConfirmation, right: EmailDeviceConfirmation) {
  return left.challengeId === right.challengeId && left.secretVersion === right.secretVersion && left.publicVersion === right.publicVersion;
}
