import { reportAccountSnapshot } from './reportModerationService';

/** Capture before the first await, including lazy service imports. */
export function profileAccountGuard(expectedUid: string, extra?: () => void): () => void {
  const captured = reportAccountSnapshot();
  const guard = () => {
    extra?.();
    const current = reportAccountSnapshot();
    if (!expectedUid || captured.uid !== expectedUid || current.uid !== expectedUid || current.epoch !== captured.epoch) {
      throw Object.assign(new Error('Your account changed. Reopen profile setup and try again.'), { code: 'account-changed' });
    }
  };
  guard();
  return guard;
}

export const PROFILE_SETUP_TIMEOUT_MS = 15_000;

/** Timeout retires the caller, not a possibly committed server operation. */
export async function withProfileSetupDeadline<T>(operation: (guard: () => void) => Promise<T>, guard: () => void): Promise<T> {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = () => Object.assign(new Error('Profile setup took too long. Please try again.'), { code: 'deadline-exceeded' });
  const current = () => { guard(); if (!active) throw timeoutError(); };
  try {
    current();
    const result = await Promise.race([
      operation(current),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { active = false; reject(timeoutError()); }, PROFILE_SETUP_TIMEOUT_MS); }),
    ]);
    current();
    return result;
  } finally { active = false; if (timer) clearTimeout(timer); }
}

export type ProfileSetupError = { message: string; recoveryAvailable: boolean; title?: string };
export function profileSetupFailure(error: unknown): ProfileSetupError {
  const value = error as { details?: { reason?: unknown; recoveryAvailable?: unknown }; name?: unknown; code?: unknown } | null;
  const code = String(value?.code || value?.name || '').replace(/^(functions|auth)\//, '');
  const failure = (title: string, message: string): ProfileSetupError => ({ title, message, recoveryAvailable: false });
  if (value?.details?.reason === 'profile-recovery-required') return {
    title: 'Confirm your profile',
    message: value.details.recoveryAvailable === true
      ? 'Your existing profile needs a confirmed recovery. Choose Recover profile to continue.'
      : 'Your profile needs an account ownership review. Contact support, or retry after the review is complete.',
    recoveryAvailable: value.details.recoveryAvailable === true,
  };
  if (['not-found', 'unimplemented', 'not_yet_ported', 'profile-service-invalid-response'].includes(code)) return failure(
    'Profile loading is unavailable',
    'You’re still signed in, but we can’t load your profile right now. Please try again later.',
  );
  if (code === 'deadline-exceeded') return failure('Profile loading timed out', 'This is taking longer than expected. You’re still signed in. Try again.');
  if (code === 'resource-exhausted') return failure('Profile loading is busy', 'Too many profile checks landed at once. You’re still signed in. Try again in a moment.');
  if (code === 'network-request-failed' || (error instanceof TypeError && /fetch|network/i.test(error.message))) return failure(
    'Couldn’t connect to your profile', 'Check your connection and try again. You’re still signed in.',
  );
  if (['unauthenticated', 'invalid-user-token', 'user-token-expired'].includes(code)) return failure(
    'Please check your sign-in', 'Your sign-in needs to be checked again. Try again, or sign out and sign back in.',
  );
  if (['permission-denied', 'failed-precondition'].includes(code)) return failure(
    'Profile access needs attention', 'Your profile couldn’t be opened with this sign-in. Try again, or contact support if this continues.',
  );
  // The SDK reports failed fetches/CORS and some server failures as "internal".
  // That does not prove a missing service, bad connection, or missing profile.
  return failure('Your profile couldn’t be loaded', 'You’re still signed in. Please try again, or contact support if this continues.');
}
