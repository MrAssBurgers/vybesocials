import { isNativePlatform } from '@/lib/capacitor';
import { isDespiaRuntime } from '@/lib/despiaBridge';

const PRODUCTION_ORIGIN = 'https://vybehub.app';

function isEmbeddedShellOrigin(origin: string): boolean {
  if (!origin || origin === 'null') return true;
  if (/localhost|127\.0\.0\.1/i.test(origin)) return true;
  if (origin.startsWith('capacitor://') || origin.startsWith('ionic://')) return true;
  if (origin.startsWith('file://')) return true;
  return false;
}

/** Production origin for deep links opened from native shells. */
export function getProductionOrigin(): string {
  return PRODUCTION_ORIGIN;
}

/**
 * Email confirmation + OAuth redirects must use a real HTTPS URL on Despia /
 * Capacitor shells (they run from localhost). Supabase rejects or silently
 * drops emails when redirect URLs are not on the allow list.
 */
export function getAuthRedirectUrl(path = '/auth/callback'): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  if (typeof window === 'undefined') {
    return `${PRODUCTION_ORIGIN}${cleanPath}`;
  }

  const origin = window.location.origin;
  if (isDespiaRuntime() || isNativePlatform || isEmbeddedShellOrigin(origin)) {
    return `${PRODUCTION_ORIGIN}${cleanPath}`;
  }

  return `${origin}${cleanPath}`;
}

/** Password reset links always use canonical production HTTPS (vybehub.app, not www). */
export function getPasswordResetRedirectUrl(): string {
  return `${PRODUCTION_ORIGIN}/reset-password`;
}
