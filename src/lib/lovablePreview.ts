/**
 * Detect Lovable editor / preview hosts (for logging and OneSignal domain quirks).
 *
 * Product behavior matches vybehub.app on these hosts — same Firebase backend, auth,
 * maintenance gate, and UI. Local Vite (127.0.0.1 / localhost) also matches production.
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
