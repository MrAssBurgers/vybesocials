const MIGRATION_LOGIN_ERROR =
  'VYBE was upgraded — your old password will not work. Tap Forgot password to set a new one, or sign in with Google or Apple if you used those.';
const GENERIC_LOGIN_ERROR = 'Email or password is incorrect.';

/** User-facing copy when auth returns invalid_credentials. */
export function getLoginCredentialErrorMessage(hasMigrationSignal = false): string {
  return hasMigrationSignal ? MIGRATION_LOGIN_ERROR : GENERIC_LOGIN_ERROR;
}

export function isInvalidLoginCredentialError(error: unknown): boolean {
  const err = error as { message?: string; code?: string; error_code?: string } | null;
  const msg = (err?.message || '').toLowerCase();
  const code = (err?.code || err?.error_code || '').toLowerCase();
  return (
    code === 'invalid_credentials' ||
    code === 'auth/invalid-credential' ||
    code === 'auth/invalid-login-credentials' ||
    code === 'auth/wrong-password' ||
    msg.includes('invalid login credentials') ||
    msg.includes('auth/invalid-credential') ||
    (msg.includes('invalid') && msg.includes('credential'))
  );
}
