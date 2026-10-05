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

export type ProfileSetupError = { message: string; recoveryAvailable: boolean };
export function profileSetupFailure(error: unknown): ProfileSetupError {
  const value = error as { details?: { reason?: unknown; recoveryAvailable?: unknown }; name?: unknown; code?: unknown } | null;
  if (value?.details?.reason === 'profile-recovery-required') return {
    message: value.details.recoveryAvailable === true
      ? 'Your existing profile needs a confirmed recovery. Choose Recover profile to continue.'
      : 'Your profile needs an account ownership review. Contact support, or retry after the review is complete.',
    recoveryAvailable: value.details.recoveryAvailable === true,
  };
  return { message: 'Your account is signed in, but your profile could not be loaded. Check your connection and try again.', recoveryAvailable: false };
}
