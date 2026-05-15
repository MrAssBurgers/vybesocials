// Shared WebAuthn / Passkey Relying Party helpers.
//
// Passkeys are bound to a single rpID (the domain). To make passkeys work
// from every shell that loads the VYBE app — production web, Lovable preview,
// and the Capacitor iOS / Android wrappers (which load with origin
// `capacitor://localhost` or `https://localhost`) — we always REGISTER and
// VERIFY against the production domain `vybehub.app` and accept any of the
// known shells as a valid `expectedOrigin`.
//
// The Lovable editor preview is treated separately so passkeys created there
// never leak into the production credential set.

const PROD_RP_ID = 'vybehub.app';
const PROD_ORIGINS = [
  'https://vybehub.app',
  'https://www.vybehub.app',
  // Capacitor iOS WKWebView ships pages with this origin.
  'capacitor://localhost',
  // Capacitor Android (and some iOS configs) use https://localhost.
  'https://localhost',
  // Lovable published mirror.
  'https://vybeapp.lovable.app',
];

function isPreviewOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host.endsWith('.lovable.app') || host.endsWith('.lovableproject.com');
  } catch {
    return false;
  }
}

/** rpID to use for the credential. WebAuthn requires rpId to equal — or be a
 * registrable suffix of — the current origin's host. So for any standard web
 * origin (https://...) we use that host directly. Native shells with non-http
 * origins (capacitor://localhost, https://localhost) fall back to vybehub.app
 * (which the native shell asserts via Associated Domains / assetlinks). */
export function rpIdFor(req: Request): string {
  const origin = req.headers.get('origin') || '';
  try {
    const u = new URL(origin);
    if (u.protocol === 'https:' && u.hostname && u.hostname !== 'localhost') {
      return u.hostname;
    }
  } catch { /* fall through */ }
  return PROD_RP_ID;
}

/** All origins simplewebauthn should accept for this request. */
export function expectedOriginsFor(req: Request): string[] {
  const origin = req.headers.get('origin') || '';
  if (isPreviewOrigin(origin)) return [origin];
  // For prod / native shells, accept the full known set so verification
  // succeeds regardless of which wrapper the user is in.
  const set = new Set<string>(PROD_ORIGINS);
  if (origin) set.add(origin);
  return Array.from(set);
}
