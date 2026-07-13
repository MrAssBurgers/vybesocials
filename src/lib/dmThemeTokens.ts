/**
 * Semantic DM theme tokens (Phase 3 — Messages redesign).
 *
 * These map to CSS custom properties defined under the `.dm-inbox` / `.dm-thread`
 * scopes in `src/index.css`. Every token is derived from the app's existing
 * semantic theme vars (`--primary`, `--accent`, `--background`, `--foreground`,
 * `--card`, `--muted`, `--border`, `--destructive`) so DM surfaces automatically
 * follow whatever theme (default, AI-generated, marketplace) the user has applied —
 * no hardcoded colors here or in the components that consume these tokens.
 */
export const DM_THEME_TOKENS = [
  'elevated',
  'surface',
  'glass',
  'divider',
  'glow',
  'unread',
  'online',
  'story-ring',
  'sent',
  'received',
  'composer',
  'nav',
  'shadow',
  'overlay',
] as const;

export type DmThemeToken = (typeof DM_THEME_TOKENS)[number];

/** CSS custom property name for a given token, e.g. `--dm-theme-elevated`. */
export function dmThemeVarName(token: DmThemeToken): string {
  return `--dm-theme-${token}`;
}

/** `var(--dm-theme-<token>)` reference for inline styles. */
export function dmThemeVar(token: DmThemeToken, fallback?: string): string {
  const name = dmThemeVarName(token);
  return fallback ? `var(${name}, ${fallback})` : `var(${name})`;
}

/**
 * Reads the resolved value of a DM theme token from the DOM (best-effort).
 * Useful for JS-driven contexts (canvas, non-CSS animation) that can't
 * reference `var()` directly. Returns `fallback` outside the browser or
 * when the scope hasn't mounted yet.
 */
export function readDmThemeVar(token: DmThemeToken, fallback = '', scopeEl?: Element | null): string {
  if (typeof window === 'undefined') return fallback;
  const el = scopeEl ?? document.querySelector('.dm-inbox, .dm-thread') ?? document.documentElement;
  const value = getComputedStyle(el).getPropertyValue(dmThemeVarName(token)).trim();
  return value || fallback;
}
