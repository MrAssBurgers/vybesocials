/**
 * Post-OAuth profile claim + friendly handling for Auth identity conflicts.
 * Firestore claim merges migrated profiles by email; Firebase “one account per email”
 * must stay enabled in the console for automatic provider merge on new sign-in.
 */
import { db } from '@/lib/firebase';
import type { VybeAuthError } from '@/lib/firebase/types';

/** Claim / merge Firestore profile for the signed-in email (safe no-op on failure). */
export async function claimProfileAfterOAuth(): Promise<void> {
  try {
    await db.rpc('claim_profile_by_email');
  } catch {
    /* optional enrichment — login continues */
  }
}

export function isAccountExistsWithDifferentCredential(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; name?: string; message?: string };
  const code = String(e.code || e.name || '');
  return (
    code === 'auth/account-exists-with-different-credential' ||
    code === 'auth/credential-already-in-use' ||
    /account-exists-with-different-credential/i.test(e.message || '') ||
    /credential-already-in-use/i.test(e.message || '')
  );
}

/**
 * When Firebase cannot auto-link (different providers, console setting off, etc.),
 * guide the user — never leave a half-session toast that says “Something went wrong”.
 */
export function getAccountExistsOAuthMessage(): string {
  return 'An account already exists with this email using another sign-in method. Sign in with that method, then link Google or Apple in Settings → Connections.';
}

export function mapOAuthLinkError(error: unknown): VybeAuthError {
  if (isAccountExistsWithDifferentCredential(error)) {
    return {
      message: getAccountExistsOAuthMessage(),
      name: 'auth/account-exists-with-different-credential',
    };
  }
  if (error && typeof error === 'object') {
    const e = error as { message?: string; code?: string; name?: string };
    const code = e.code || e.name;
    const rawMessage = typeof e.message === 'string' ? e.message.trim() : '';
    // Preserve Firebase message/code; never collapse to bare "Sign-in failed" when a code exists.
    const message =
      rawMessage ||
      (code ? `Sign-in failed (${code})` : 'Sign-in failed');
    return {
      message,
      name: code,
    };
  }
  return { message: 'Sign-in failed' };
}
