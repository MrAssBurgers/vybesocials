/** User-facing copy when Supabase returns invalid_credentials (wrong password or no account on this project). */
export function getLoginCredentialErrorMessage(): string {
  return (
    'No matching account on VYBE\'s current servers. ' +
    'Tap Forgot password to set a password for this email, or sign up if you have not created an account here yet. ' +
    'Google or Apple sign-in only works if you linked that provider on this site.'
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
