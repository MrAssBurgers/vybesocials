import { getDocumentFromServer } from '@/lib/firebase/firestoreDb';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { tokenAccountGuard } from '@/lib/tokenMarketplaceService';

export const SIGN_IN_CHECK_TIMEOUT_MS = 20_000;
const confirmationError = (code: string, message: string) => Object.assign(new Error(message), { code });

/** A timed-out check cannot dispatch another step or commit its late result. */
export async function withSignInCheckDeadline<T>(guard: () => void, run: (guard: () => void) => Promise<T>): Promise<T> {
  let retired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const current = () => {
    guard();
    if (retired) throw confirmationError('auth/confirmation-timeout', 'Sign-in confirmation took too long. Please try again.');
  };
  try {
    current();
    return await Promise.race([
      Promise.resolve().then(() => run(current)).then(value => { current(); return value; }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => {
        retired = true;
        reject(confirmationError('auth/confirmation-timeout', 'Sign-in confirmation took too long. Please try again.'));
      }, SIGN_IN_CHECK_TIMEOUT_MS); }),
    ]);
  } finally { retired = true; clearTimeout(timer); }
}

export function checkedEmailChallenge(value: unknown, expectedId?: string, expectedUid?: string) {
  const row = value as Record<string, unknown> | null;
  if (!row || row.ok !== true || typeof row.challengeId !== 'string'
    || !/^[A-Za-z0-9_-]{1,160}$/.test(row.challengeId)
    || (expectedId !== undefined && row.challengeId !== expectedId)
    || (expectedUid !== undefined && row.ownerUid !== expectedUid)
    || typeof row.expiresAt !== 'string' || !Number.isFinite(Date.parse(row.expiresAt))
    || Date.parse(row.expiresAt) <= Date.now() || Date.parse(row.expiresAt) > Date.now() + 11 * 60_000) {
    throw confirmationError('auth/confirmation-unavailable', 'Email confirmation is temporarily unavailable. Your account still requires a code. Please try again later.');
  }
  return { challengeId: row.challengeId, expiresAt: row.expiresAt };
}

/** A real issued code still gates sign-in. `{ok:true}` with no challengeId is the
 * deployed acknowledgement that no code was sent, so password sign-in continues. */
export function emailChallengeWasNotIssued(value: unknown): boolean {
  const row = value as Record<string, unknown> | null;
  return !!row && row.ok === true && row.challengeId == null;
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
  if (emailChallengeWasNotIssued(result.data)) return null;
  return checkedEmailChallenge(result.data, undefined, uid);
}
