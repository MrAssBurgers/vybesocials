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

/**
 * Auto-detect email vs username and resolve to the Firebase Auth email.
 * Usernames are looked up server-side (profiles are not world-readable when logged out).
 */
export async function resolveLoginEmail(identifier: string): Promise<string> {
  const trimmed = identifier.trim();
  if (!trimmed) {
    throw new Error('Enter your email or username');
  }

  if (looksLikeEmail(trimmed)) {
    return normalizeLoginEmail(trimmed);
  }

  const username = trimmed.replace(/^@/, '');
  const { data, error } = await invokeFunction<{ email?: string; kind?: string }>('auth-qr', {
    action: 'resolve_login',
    identifier: username,
  });

  if (error || !data?.email) {
    throw new Error('Invalid username/email or password. Please try again.');
  }

  return normalizeLoginEmail(data.email);
}
