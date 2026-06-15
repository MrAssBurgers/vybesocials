/** User-facing copy when Supabase returns invalid_credentials (wrong password or unknown email). */
export function getLoginCredentialErrorMessage(): string {
  return (
    'Invalid email or password. Tap Forgot password to set a new password for this email, ' +
    'or Sign up if you have not created an account yet. Google or Apple only works if you linked that provider here.'
  );
}

export function isInvalidLoginCredentialError(error: unknown): boolean {
  const err = error as { message?: string; code?: string; error_code?: string } | null;
  const msg = (err?.message || '').toLowerCase();
  const code = (err?.code || err?.error_code || '').toLowerCase();
  return (
    code === 'invalid_credentials' ||
    msg.includes('invalid login credentials') ||
    (msg.includes('invalid') && msg.includes('credential'))
  );
}
