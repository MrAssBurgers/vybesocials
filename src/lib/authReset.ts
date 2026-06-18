import { db } from '@/lib/firebase';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { getPasswordResetRedirectUrl } from '@/lib/authRedirect';

/**
 * Password reset via Firebase Auth.
 * Tries server-side Identity Toolkit first (reliable from all domains),
 * then client SDK fallback.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();

  const { data, error } = await invokeFunction<{ ok?: boolean; message?: string }>(
    'send-reset-email',
    { email: normalized },
  );

  // Only skip client fallback when the callable explicitly confirmed success.
  if (!error && data?.ok === true) {
    return;
  }

  if (error) {
    console.warn('[authReset] Cloud reset failed, trying client SDK:', error.message);
  }

  const { error: clientError } = await db.auth.resetPasswordForEmail(normalized, {
    redirectTo: getPasswordResetRedirectUrl(),
  });
  if (clientError) throw clientError;
}
