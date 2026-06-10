/**
 * Detect Lovable editor / sandbox hosts where we skip production 2FA gates
 * and use direct Supabase password sign-in.
 *
 * Local Vite (127.0.0.1 / localhost) is NOT a preview host — it should match
 * production vybehub.app auth flows. Keep in sync with auth-2fa-preauth preview bypass regex.
 */
export function isLovablePreviewHost(): boolean {
  if (typeof window === 'undefined') return false;

  const { hostname, search } = window.location;

  if (hostname === 'vybehub.app' || hostname === 'www.vybehub.app') {
    return false;
  }

  if (
    hostname.endsWith('.lovableproject.com') ||
    hostname.endsWith('.lovable.app') ||
    hostname.startsWith('id-preview--') ||
    hostname.includes('preview')
  ) {
    return true;
  }

  if (new URLSearchParams(search).has('__lovable_token')) {
    return true;
  }

  return false;
}
