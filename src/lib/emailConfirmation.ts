import { getDocumentFromServer } from '@/lib/firebase/firestoreDb';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { tokenAccountGuard } from '@/lib/tokenMarketplaceService';

export function checkedEmailChallenge(value: unknown, expectedId?: string, expectedUid?: string) {
  const row = value as Record<string, unknown> | null;
  if (!row || row.ok !== true || typeof row.challengeId !== 'string'
    || !/^[A-Za-z0-9_-]{1,160}$/.test(row.challengeId)
    || (expectedId !== undefined && row.challengeId !== expectedId)
    || (expectedUid !== undefined && row.ownerUid !== expectedUid)
    || typeof row.expiresAt !== 'string' || !Number.isFinite(Date.parse(row.expiresAt))
    || Date.parse(row.expiresAt) <= Date.now() || Date.parse(row.expiresAt) > Date.now() + 11 * 60_000) {
    throw new Error('The email confirmation could not be started. Please sign in again.');
  }
  return { challengeId: row.challengeId, expiresAt: row.expiresAt };
}

/** Never continue an enabled email check after a failed or incomplete receipt. */
export async function beginEmailConfirmation(uid: string, guard = tokenAccountGuard(uid)) {
  guard();
  const settings = await getDocumentFromServer<{ email_2fa_enabled?: boolean }>('user_2fa_settings', uid);
  guard();
  if (settings?.email_2fa_enabled !== undefined && typeof settings.email_2fa_enabled !== 'boolean') throw new Error('Your sign-in preferences could not be verified. Please retry.');
  if (settings?.email_2fa_enabled !== true) return null;
  const result = await invokeFunction('auth-2fa-request', { expectedOwnerUid: uid });
  guard();
  if (result.error) throw new Error('Email confirmation is unavailable. Please try signing in again.');
  return checkedEmailChallenge(result.data, undefined, uid);
}
