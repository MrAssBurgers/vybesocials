import { db } from '@/lib/firebase';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { getPasswordResetRedirectUrl } from '@/lib/authRedirect';

function shouldFallbackToClientReset(error: { name?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = (error.name || '').replace(/^functions\//, '');
  const msg = (error.message || '').toLowerCase();
  return (
    code === 'failed-precondition' ||
    code === 'not-found' ||
    code === 'unavailable' ||
    msg.includes('resend') ||
    msg.includes('not configured') ||
    msg.includes('not_yet_ported')
  );
}

/** Password reset — Resend-branded email via Cloud Function, with client Firebase fallback. */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();

  const { data, error } = await invokeFunction<{ ok?: boolean }>('request-password-reset', {
    email: normalized,
  });

  if (!error && data?.ok) return;

  if (shouldFallbackToClientReset(error)) {
    const { error: resetError } = await db.auth.resetPasswordForEmail(normalized, {
      redirectTo: getPasswordResetRedirectUrl(),
    });
    if (resetError) throw resetError;
    return;
  }

  if (error) throw error;
}
