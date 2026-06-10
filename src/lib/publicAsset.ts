/** Resolve a file from `/public` — works on vybehub.app, Lovable preview, and local dev. */
export function publicAsset(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base;
  return prefix ? `${prefix}${normalized}` : normalized;
}
