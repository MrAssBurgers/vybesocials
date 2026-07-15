/**
 * Resolve Firebase Auth domain for the JS SDK.
 *
 * Runtime probe (2026-07-15):
 * - https://vybe-daaab.firebaseapp.com/__/auth/handler → real Firebase Auth handler
 * - https://vybe-daaab.web.app/__/auth/handler → real Firebase Auth handler
 * - https://vybehub.app/__/auth/handler → VYBE SPA (index.html), NOT the Auth handler
 * - https://www.vybehub.app/__/auth/handler → same SPA false-positive
 *
 * Do NOT set authDomain to vybehub.app until Firebase Hosting (or an equivalent)
 * serves /__/auth/** for that custom domain. SPA rewrites currently swallow it.
 */
export const DEFAULT_FIREBASE_AUTH_DOMAIN = 'vybe-daaab.firebaseapp.com';

export function getFirebaseAuthDomain(envValue?: string | null): string {
  const configured = (envValue ?? '').trim();
  if (!configured) return DEFAULT_FIREBASE_AUTH_DOMAIN;

  const host = configured
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();

  // Guard: custom marketing domains serve SPA for /__/auth/* today.
  if (host === 'vybehub.app' || host === 'www.vybehub.app') {
    return DEFAULT_FIREBASE_AUTH_DOMAIN;
  }

  return host || DEFAULT_FIREBASE_AUTH_DOMAIN;
}

export function getFirebaseAuthHandlerUrl(authDomain = getFirebaseAuthDomain()): string {
  return `https://${authDomain}/__/auth/handler`;
}
