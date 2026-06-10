/**
 * Shared origin allowlist for Stripe redirects and similar
 * client-controlled URL contexts. Prevents open-redirect attacks
 * where a crafted Origin/Referer header would send post-checkout
 * traffic to an attacker-controlled domain.
 */

const ALLOWED_ORIGINS = new Set<string>([
  "https://vybehub.app",
  "https://www.vybehub.app",
  "https://vybeapp.lovable.app",
  "https://id-preview--416714c8-d013-4aff-984d-522418a9bbc7.lovable.app",
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://localhost:3000",
]);

const DEFAULT_ORIGIN = "https://vybehub.app";

/**
 * Returns a safe origin string. If the client-supplied origin (or referer)
 * isn't in the allowlist, falls back to the canonical production origin.
 */
export function safeOrigin(req: Request): string {
  const tryValue = (raw: string | null): string | null => {
    if (!raw) return null;
    try {
      const u = new URL(raw);
      const candidate = `${u.protocol}//${u.host}`;
      return ALLOWED_ORIGINS.has(candidate) ? candidate : null;
    } catch {
      return ALLOWED_ORIGINS.has(raw) ? raw : null;
    }
  };
  return (
    tryValue(req.headers.get("origin")) ||
    tryValue(req.headers.get("referer")) ||
    DEFAULT_ORIGIN
  );
}
