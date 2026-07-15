import { getProductionOrigin } from '@/lib/authRedirect';

/** HTTPS path phone Camera / Universal Links open to approve a waiting QR session. */
export const QR_CLAIM_PATH = '/auth/qr/claim';

/** Static bridge page — works even before SPA route ships; bounces into the app. */
export const QR_CLAIM_BRIDGE_PATH = '/qr-claim.html';

/** Build a camera-scannable Universal Link for Quick Sign-In approve. */
export function buildQrSignInClaimUrl(nonce: string): string {
  const clean = nonce.trim();
  // Prefer SPA path — Lovable SPA fallback serves /auth/*; static .html 404s until published.
  const url = new URL(`${getProductionOrigin()}${QR_CLAIM_PATH}`);
  url.searchParams.set('nonce', clean);
  return url.toString();
}

/**
 * Accept Camera links, in-app payloads, and legacy `vybe-qr:` codes.
 * Returns the pairing nonce or null.
 */
export function parseQrSignInNonce(data: string): string | null {
  const raw = (data || '').trim();
  if (!raw) return null;

  try {
    const u = new URL(raw);
    const fromQuery = u.searchParams.get('nonce');
    if (fromQuery) return fromQuery.trim();
    if (u.hash.startsWith('#nonce=')) return u.hash.slice(7).trim();
    const parts = u.pathname.split('/').filter(Boolean);
    const claimIdx = parts.findIndex((p) => p === 'claim');
    if (claimIdx >= 0 && parts[claimIdx + 1] && /^[A-Za-z0-9_-]{16,}$/.test(parts[claimIdx + 1])) {
      return parts[claimIdx + 1];
    }
  } catch {
    /* not a URL */
  }

  if (raw.startsWith('vybe-qr:')) return raw.slice(8).trim() || null;
  if (/^[A-Za-z0-9_-]{16,}$/.test(raw)) return raw;
  return null;
}
