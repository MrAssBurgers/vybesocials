/**
 * Derive Supabase localStorage keys from env so auth session detection
 * survives project ref changes without hardcoding.
 */

function parseEnv(value: string | undefined): string {
  if (!value) return '';
  return value.trim().replace(/^["']|["']$/g, '');
}

export function getSupabaseProjectRef(): string {
  const url = parseEnv(import.meta.env.VITE_SUPABASE_URL as string | undefined);
  const fromUrl = url.match(/https:\/\/([^.]+)\.supabase\.co/i)?.[1];
  if (fromUrl) return fromUrl;

  const projectId = parseEnv(import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined);
  if (projectId) return projectId;

  return 'agtcyxjxgkdyoxwxkjth';
}

export function getSupabaseAuthStorageKey(): string {
  return `sb-${getSupabaseProjectRef()}-auth-token`;
}

export function hasStoredSupabaseSession(): boolean {
  try {
    return !!localStorage.getItem(getSupabaseAuthStorageKey());
  } catch {
    return false;
  }
}
