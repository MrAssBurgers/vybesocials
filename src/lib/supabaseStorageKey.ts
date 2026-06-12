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

  return 'hprmicwhlaaqfgshucec';
}

export function getSupabaseAuthStorageKey(): string {
  return `sb-${getSupabaseProjectRef()}-auth-token`;
}

export function hasStoredSupabaseSession(): boolean {
  try {
    const key = getSupabaseAuthStorageKey();
    return !!localStorage.getItem(key) || !!localStorage.getItem(`${key}-vybe-backup`);
  } catch {
    return false;
  }
}

/** Read auth user id from persisted Supabase session (sync, before getSession resolves). */
export function getStoredAuthUserId(): string | null {
  try {
    const key = getSupabaseAuthStorageKey();
    const raw = localStorage.getItem(key) || localStorage.getItem(`${key}-vybe-backup`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      user?: { id?: string };
      currentSession?: { user?: { id?: string } };
    };
    const userId = parsed?.user?.id ?? parsed?.currentSession?.user?.id;
    return typeof userId === 'string' ? userId : null;
  } catch {
    return null;
  }
}

/** One-time repair if Despia dropped the primary auth key but backup survived. */
export function repairSupabaseAuthStorage(): void {
  try {
    const key = getSupabaseAuthStorageKey();
    const backupKey = `${key}-vybe-backup`;
    const primary = localStorage.getItem(key);
    const backup = localStorage.getItem(backupKey);
    if (primary && !backup) localStorage.setItem(backupKey, primary);
    else if (!primary && backup) localStorage.setItem(key, backup);
  } catch {
    /* ignore */
  }
}
