/** User-facing copy when Supabase returns invalid_credentials. */
export function getLoginCredentialErrorMessage(): string {
  return (
    'Invalid email or password. Use Google or Apple if you signed up that way, or tap Forgot password.'
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
