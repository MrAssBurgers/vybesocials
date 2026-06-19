import { invokeFunction } from '@/lib/firebase/functionsService';

/**
 * Password reset via Cloud Function only (Resend + recovery.html).
 * Do not call Firebase client sendPasswordResetEmail — that sends the ugly default mailer.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();

  const { data, error } = await invokeFunction<{ ok?: boolean; message?: string }>(
    'send-reset-email',
    { email: normalized },
  );

  if (error) {
    throw new Error(error.message || 'Could not send reset email. Please try again.');
  }

  if (data?.ok !== true) {
    throw new Error('Could not send reset email. Please try again.');
  }
}
