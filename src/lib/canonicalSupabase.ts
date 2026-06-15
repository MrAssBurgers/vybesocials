/**
 * Canonical Supabase project — auth, profiles, and edge functions.
 * Lovable builds may still bake legacy refs (agtcyx/eabvbt); runtime + build redirect those to hprmic.
 */
export const CANONICAL_SUPABASE_PROJECT_ID = 'hprmicwhlaaqfgshucec';
export const CANONICAL_SUPABASE_URL = `https://${CANONICAL_SUPABASE_PROJECT_ID}.supabase.co`;

/** hprmic anon key — public publishable key for the user database. */
export const CANONICAL_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhwcm1pY3dobGFhcWZnc2h1Y2VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwNDkwODgsImV4cCI6MjA4NDYyNTA4OH0.Lk72yBKNj3sRjf5E5DQ8TLBfXB2tbjTpAAb075hbMa4';

/** Prior refs that may still be baked into old bundles or have sessions in localStorage. */
export const KNOWN_LEGACY_SUPABASE_REFS = [
  'eabvbtkxdbttjpdpbmuw',
  'agtcyxjxgkdyoxwxkjth',
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

/** True when the baked bundle/env still targets a legacy ref instead of hprmic. */
export function isLegacySupabaseEnv(): boolean {
  const projectId = envProjectId();
  const url = envSupabaseUrl();
  if (projectId === CANONICAL_SUPABASE_PROJECT_ID || url.includes(CANONICAL_SUPABASE_PROJECT_ID)) {
    return false;
  }
  return KNOWN_LEGACY_SUPABASE_REFS.some((ref) => projectId === ref || url.includes(ref));
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
