const GENERATED_USERNAME_RE = /^user_[a-f0-9]{6,}(_[a-z0-9]+)?$/i;

export function normalizeUsername(value: string | null | undefined): string {
  if (!value) return '';
  return value.toLowerCase().replace(/\s+/g, '');
}

/** True for auto-generated placeholders like user_a1b2c3d4. */
export function isGeneratedUsername(username: string | null | undefined): boolean {
  if (!username) return true;
  return GENERATED_USERNAME_RE.test(username.trim());
}

export function isValidUsernameFormat(username: string): boolean {
  return username.length >= 3 && /^[a-z0-9_]+$/.test(username);
}

const PENDING_SIGNUP_USERNAME_KEY = 'vybe-signup-username';

export function stashSignupUsername(username: string): void {
  try {
    sessionStorage.setItem(PENDING_SIGNUP_USERNAME_KEY, normalizeUsername(username));
  } catch { /* noop */ }
}

export function peekSignupUsername(): string {
  try {
    return sessionStorage.getItem(PENDING_SIGNUP_USERNAME_KEY) || '';
  } catch {
    return '';
  }
}

export function clearSignupUsername(): void {
  try {
    sessionStorage.removeItem(PENDING_SIGNUP_USERNAME_KEY);
  } catch { /* noop */ }
}

export function resolveSignupUsername(
  userMetadata?: Record<string, unknown> | null,
): string {
  const fromMeta = normalizeUsername(
    typeof userMetadata?.username === 'string' ? userMetadata.username : '',
  );
  if (fromMeta && isValidUsernameFormat(fromMeta)) return fromMeta;
  const pending = peekSignupUsername();
  if (pending && isValidUsernameFormat(pending)) return pending;
  return '';
}
