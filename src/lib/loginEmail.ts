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
    // #region agent log
    fetch('http://127.0.0.1:7693/ingest/1847f3ab-7d03-4b99-8dbe-84076ae9145e', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'adb115' },
      body: JSON.stringify({
        sessionId: 'adb115',
        runId: 'login-repro',
        hypothesisId: 'L2',
        location: 'loginEmail.ts:resolve',
        message: 'login_kind_email',
        data: { len: trimmed.length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    console.info('[VYBE:login] kind=email');
    return normalizeLoginEmail(trimmed);
  }

  const username = trimmed.replace(/^@/, '');
  const { data, error } = await invokeFunction<{ email?: string; kind?: string }>('auth-qr', {
    action: 'resolve_login',
    identifier: username,
  });

  // #region agent log
  fetch('http://127.0.0.1:7693/ingest/1847f3ab-7d03-4b99-8dbe-84076ae9145e', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'adb115' },
    body: JSON.stringify({
      sessionId: 'adb115',
      runId: 'login-repro',
      hypothesisId: 'L2',
      location: 'loginEmail.ts:resolve',
      message: 'login_kind_username',
      data: {
        ok: !!(data?.email && !error),
        errName: error?.name || null,
        hasEmail: !!data?.email,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  console.info('[VYBE:login] kind=username', { ok: !!(data?.email && !error), err: error?.name });

  if (error || !data?.email) {
    throw new Error('Invalid username/email or password. Please try again.');
  }

  return normalizeLoginEmail(data.email);
}
