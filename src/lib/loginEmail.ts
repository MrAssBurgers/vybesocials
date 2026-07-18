import { invokeFunction } from '@/lib/firebase/functionsService';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalize email for Firebase Auth (trim + lowercase). */
export function normalizeLoginEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** True when the identifier looks like an email address (not a username). */
export function looksLikeEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

function loginLookupError(message: string, name: string): Error {
  const err = new Error(message) as Error & { name: string };
  err.name = name;
  return err;
}

/**
 * Auto-detect email vs username and resolve to the Firebase Auth email.
 * Usernames are looked up server-side against onboarding `profiles.username`
 * (plus `user_auth_index` / Auth fallbacks) via authQr `resolve_login`.
 */
export async function resolveLoginEmail(identifier: string): Promise<string> {
  const trimmed = identifier.trim();
  if (!trimmed) {
    throw loginLookupError('Enter your email or username', 'login/empty-identifier');
  }

  if (looksLikeEmail(trimmed)) {
    return normalizeLoginEmail(trimmed);
  }

  const username = trimmed.replace(/^@/, '').trim();
  if (username.length < 3) {
    throw loginLookupError('Enter a valid username or email.', 'login/invalid-username');
  }

  const { data, error } = await invokeFunction<{ email?: string; kind?: string }>('auth-qr', {
    action: 'resolve_login',
    identifier: username,
  });

  const errName = String((error as { name?: string } | null)?.name || '');
  const errMsg = String((error as { message?: string } | null)?.message || '');
  const notFound =
    !data?.email &&
    (errName === 'not-found' ||
      /account not found/i.test(errMsg) ||
      (!error && !data?.email));

  if (notFound) {
    throw loginLookupError(
      'No account found with that username.',
      'login/username-not-found',
    );
  }

  if (error || !data?.email) {
    throw loginLookupError(
      'Could not look up that username. Check your connection and try again.',
      'login/username-lookup-failed',
    );
  }

  return normalizeLoginEmail(data.email);
}
