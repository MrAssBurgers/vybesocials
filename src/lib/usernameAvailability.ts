import { db } from '@/lib/firebase';
import { isValidUsernameFormat, normalizeUsername } from '@/lib/username';

export type UsernameAvailabilityResult = {
  available: boolean;
  /** False when production RPC is missing — signup may proceed optimistically. */
  rpcChecked: boolean;
  error?: string;
};

function isRpcMissingError(error: { code?: string; message?: string }): boolean {
  const code = error.code || '';
  const msg = (error.message || '').toLowerCase();
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    code === 'permission-denied' ||
    /permission denied/i.test(msg) ||
    /could not find the function/i.test(msg) ||
    /404/.test(msg)
  );
}

/** Check username availability; fail-soft when RPC is missing or unauthenticated (profiles require sign-in). */
export async function checkUsernameAvailable(
  username: string,
  excludeUserId?: string,
): Promise<UsernameAvailabilityResult> {
  const clean = normalizeUsername(username);
  if (!isValidUsernameFormat(clean)) {
    return {
      available: false,
      rpcChecked: true,
      error: 'Username must be at least 3 characters.',
    };
  }

  const { data, error } = await db.rpc('is_username_available', {
    p_username: clean,
    exclude_user_id: excludeUserId,
  });

  if (error) {
    if (isRpcMissingError(error)) {
      return { available: true, rpcChecked: false };
    }
    return {
      available: false,
      rpcChecked: true,
      error: 'Unable to verify username. Please try again.',
    };
  }

  if (!data) {
    return { available: false, rpcChecked: true };
  }

  return { available: true, rpcChecked: true };
}
