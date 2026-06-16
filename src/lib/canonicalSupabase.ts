/**
 * Canonical production Supabase — user-owned project (hprmic).
 * Lovable builds may still bake agtcyx/eabvbt; runtime + build redirect those to hprmic.
 */
export const CANONICAL_SUPABASE_PROJECT_ID = 'hprmicwhlaaqfgshucec';
export const CANONICAL_SUPABASE_URL = `https://${CANONICAL_SUPABASE_PROJECT_ID}.supabase.co`;

/** hprmic anon key — public publishable key for the owned production database. */
export const CANONICAL_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhwcm1pY3dobGFhcWZnc2h1Y2VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwNDkwODgsImV4cCI6MjA4NDYyNTA4OH0.Lk72yBKNj3sRjf5E5DQ8TLBfXB2tbjTpAAb075hbMa4';

/** Legacy Lovable live project — media URLs in old rows may still reference this host. */
export const LEGACY_READ_PROJECT_ID = 'agtcyxjxgkdyoxwxkjth';

/** Obsolete refs — purge/migrate to hprmic primary auth key. */
export const OBSOLETE_AUTH_REFS = ['eabvbtkxdbttjpdpbmuw'] as const;

/** Baked env refs that must redirect to hprmic (includes legacy agtcyx after full migration). */
export const MISCONFIGURED_AUTH_REFS = [
  ...OBSOLETE_AUTH_REFS,
  LEGACY_READ_PROJECT_ID,
] as const;

/** Prior refs to migrate into hprmic primary auth key. */
export const KNOWN_LEGACY_SUPABASE_REFS = [
  ...OBSOLETE_AUTH_REFS,
  LEGACY_READ_PROJECT_ID,
] as const;

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

/** True when the baked bundle/env still targets agtcyx/eabvbt instead of hprmic. */
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
