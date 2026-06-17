import { db } from '@/lib/firebase';
import { getPasswordResetRedirectUrl } from '@/lib/authRedirect';

/** Firebase Auth password reset email (action link → /reset-password?oobCode=…). */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const redirectTo = getPasswordResetRedirectUrl();

  const { error: resetError } = await db.auth.resetPasswordForEmail(normalized, {
    redirectTo,
  });

  if (resetError) throw resetError;
}
