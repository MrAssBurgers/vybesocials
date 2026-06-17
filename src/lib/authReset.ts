import { db } from '@/lib/firebase';
import { getPasswordResetRedirectUrl } from '@/lib/authRedirect';

/**
 * Password reset via Firebase Auth — uses branded templates in Firebase Console
 * (sync with `npm run firebase:sync-email-templates`).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const { error } = await db.auth.resetPasswordForEmail(normalized, {
    redirectTo: getPasswordResetRedirectUrl(),
  });
  if (error) throw error;
}
