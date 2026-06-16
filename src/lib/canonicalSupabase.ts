/**
 * Live production Supabase — auth users and profiles live here (agtcyx).
 * Lovable builds may still bake hprmic/eabvbt; runtime + build redirect those to agtcyx.
 */
export const CANONICAL_SUPABASE_PROJECT_ID = 'agtcyxjxgkdyoxwxkjth';
export const CANONICAL_SUPABASE_URL = `https://${CANONICAL_SUPABASE_PROJECT_ID}.supabase.co`;

/** agtcyx anon key — public publishable key for the live user database. */
export const CANONICAL_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFndGN5eGp4Z2tkeW94d3hranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjk5NTMsImV4cCI6MjA4NTgwNTk1M30.G92pPYU9K2z3yqXtN5R7WR_-EAIVTfl-T-GlJ-N8oYg';

/** Owned project for new content writes (auth stays on agtcyx). */
export const NEW_WRITES_PROJECT_ID = 'hprmicwhlaaqfgshucec';
export const NEW_WRITES_SUPABASE_URL = `https://${NEW_WRITES_PROJECT_ID}.supabase.co`;
export const NEW_WRITES_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhwcm1pY3dobGFhcWZnc2h1Y2VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwNDkwODgsImV4cCI6MjA4NDYyNTA4OH0.Lk72yBKNj3sRjf5E5DQ8TLBfXB2tbjTpAAb075hbMa4';

/** Obsolete refs — purge/migrate to agtcyx; never used for primary auth. */
export const OBSOLETE_AUTH_REFS = ['eabvbtkxdbttjpdpbmuw'] as const;

/** Baked env refs that must redirect to agtcyx for login (includes hprmic when used as sole client). */
export const MISCONFIGURED_AUTH_REFS = [
  ...OBSOLETE_AUTH_REFS,
  NEW_WRITES_PROJECT_ID,
] as const;

/** Prior refs to migrate into agtcyx primary auth key (excludes hprmic — dual-write session). */
export const KNOWN_LEGACY_SUPABASE_REFS = OBSOLETE_AUTH_REFS;

function parseEnv(value: string | undefined): string {
  if (!value) return '';
  return value.trim().replace(/^["']|["']$/g, '');
}

function envProjectId(): string {
  return parseEnv(import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined);
}

function envSupabaseUrl(): string {
  return parseEnv(import.meta.env.VITE_SUPABASE_URL as string | undefined);
}

/** True when the baked bundle/env still targets hprmic/eabvbt instead of live auth project. */
export function isLegacySupabaseEnv(): boolean {
  const projectId = envProjectId();
  const url = envSupabaseUrl();
  if (projectId === CANONICAL_SUPABASE_PROJECT_ID || url.includes(CANONICAL_SUPABASE_PROJECT_ID)) {
    return false;
  }
  return MISCONFIGURED_AUTH_REFS.some((ref) => projectId === ref || url.includes(ref));
}

export function getCanonicalSupabaseUrl(): string {
  if (isLegacySupabaseEnv()) return CANONICAL_SUPABASE_URL;
  const url = envSupabaseUrl();
  return url || CANONICAL_SUPABASE_URL;
}

export function getCanonicalPublishableKey(): string {
  if (isLegacySupabaseEnv()) return CANONICAL_PUBLISHABLE_KEY;
  const key = parseEnv(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);
  return key || CANONICAL_PUBLISHABLE_KEY;
}

export function getCanonicalProjectRef(): string {
  if (isLegacySupabaseEnv()) return CANONICAL_SUPABASE_PROJECT_ID;
  const url = envSupabaseUrl();
  const fromUrl = url.match(/https:\/\/([^.]+)\.supabase\.co/i)?.[1];
  if (fromUrl) return fromUrl;
  const projectId = envProjectId();
  return projectId || CANONICAL_SUPABASE_PROJECT_ID;
}
