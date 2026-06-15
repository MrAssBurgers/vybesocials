const RESET_PATH = '/reset-password';

export function isPasswordRecoveryUrl(url: URL = new URL(window.location.href)): boolean {
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const queryParams = url.searchParams;
  const type = queryParams.get('type') || hashParams.get('type');
  if (type === 'recovery') return true;
  if (queryParams.get('token_hash')) return true;
  if (hashParams.get('access_token') && hashParams.get('type') === 'recovery') return true;
  return false;
}

export function getPasswordRecoveryPath(): string {
  return RESET_PATH;
}

/** Send user to reset page preserving Supabase tokens in hash/query. */
export function redirectToPasswordRecoveryPage(): void {
  if (typeof window === 'undefined') return;
  const { pathname, search, hash } = window.location;
  if (pathname === RESET_PATH || pathname === '/auth/reset-password') return;
  window.location.replace(`${RESET_PATH}${search}${hash}`);
}
