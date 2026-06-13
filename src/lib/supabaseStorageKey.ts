import {
  CANONICAL_SUPABASE_PROJECT_ID,
  getCanonicalProjectRef,
  KNOWN_LEGACY_SUPABASE_REFS,
} from '@/lib/canonicalSupabase';

/**
 * Derive Supabase localStorage keys from env so auth session detection
 * survives project ref changes without hardcoding.
 */

const BACKUP_SUFFIX = '-vybe-backup';

/** Prior Supabase refs that may still have sessions in localStorage after migration. */
export { KNOWN_LEGACY_SUPABASE_REFS };

function readRawSession(key: string): string | null {
  try {
    return localStorage.getItem(key) || localStorage.getItem(`${key}${BACKUP_SUFFIX}`);
  } catch {
    return null;
  }
}

export function getSupabaseProjectRef(): string {
  return getCanonicalProjectRef();
}

export function getSupabaseAuthStorageKey(): string {
  return `sb-${getSupabaseProjectRef()}-auth-token`;
}

function authStorageKeyForRef(projectRef: string): string {
  return `sb-${projectRef}-auth-token`;
}

function getAccessTokenFromSessionRaw(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as {
      access_token?: string;
      currentSession?: { access_token?: string };
    };
    const token = parsed?.access_token ?? parsed?.currentSession?.access_token;
    return typeof token === 'string' ? token : null;
  } catch {
    return null;
  }
}

/** Project ref embedded in a Supabase JWT (`iss` claim). */
export function getSessionProjectRefFromRaw(raw: string): string | null {
  const accessToken = getAccessTokenFromSessionRaw(raw);
  if (!accessToken) return null;

  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(normalized)) as { iss?: string; ref?: string };
    if (typeof claims.ref === 'string' && claims.ref) return claims.ref;
    const iss = claims.iss;
    if (typeof iss === 'string') {
      const match = iss.match(/https:\/\/([^.]+)\.supabase\.co/i);
      if (match?.[1]) return match[1];
    }
    return null;
  } catch {
    return null;
  }
}

export function sessionMatchesCurrentProject(raw: string): boolean {
  const sessionRef = getSessionProjectRefFromRaw(raw);
  if (!sessionRef) return true;
  return sessionRef === getSupabaseProjectRef() || sessionRef === CANONICAL_SUPABASE_PROJECT_ID;
}

function writeSessionPair(key: string, value: string): void {
  localStorage.setItem(key, value);
  localStorage.setItem(`${key}${BACKUP_SUFFIX}`, value);
}

/** All auth storage keys to scan (canonical + known legacy refs). */
export function getAllSupabaseAuthStorageKeys(): string[] {
  const keys = new Set<string>([getSupabaseAuthStorageKey()]);
  for (const ref of KNOWN_LEGACY_SUPABASE_REFS) {
    keys.add(authStorageKeyForRef(ref));
  }
  return [...keys];
}

function readValidSessionForKey(key: string): string | null {
  const raw = readRawSession(key);
  if (!raw || !sessionMatchesCurrentProject(raw)) return null;
  return raw;
}

/**
 * If the canonical key is empty but a matching session lives under a legacy key,
 * copy it forward so the Supabase client can hydrate on cold start.
 */
export function migrateLegacySupabaseAuthStorage(): boolean {
  try {
    const canonicalKey = getSupabaseAuthStorageKey();
    const canonical = readValidSessionForKey(canonicalKey);
    if (canonical) {
      writeSessionPair(canonicalKey, canonical);
      return true;
    }

    for (const ref of KNOWN_LEGACY_SUPABASE_REFS) {
      if (ref === getSupabaseProjectRef()) continue;
      const legacyKey = authStorageKeyForRef(ref);
      const legacyRaw = readRawSession(legacyKey);
      if (!legacyRaw) continue;

      const sessionRef = getSessionProjectRefFromRaw(legacyRaw);
      if (sessionRef && sessionRef !== CANONICAL_SUPABASE_PROJECT_ID) continue;

      writeSessionPair(canonicalKey, legacyRaw);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function hasStoredSupabaseSession(): boolean {
  try {
    for (const key of getAllSupabaseAuthStorageKeys()) {
      const raw = readRawSession(key);
      if (raw && sessionMatchesCurrentProject(raw)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Read auth user id from persisted Supabase session (sync, before getSession resolves). */
export function getStoredAuthUserId(): string | null {
  try {
    const canonicalKey = getSupabaseAuthStorageKey();
    const keys = [canonicalKey, ...getAllSupabaseAuthStorageKeys().filter((k) => k !== canonicalKey)];

    for (const key of keys) {
      const raw = readRawSession(key);
      if (!raw || !sessionMatchesCurrentProject(raw)) continue;
      const parsed = JSON.parse(raw) as {
        user?: { id?: string };
        currentSession?: { user?: { id?: string } };
      };
      const userId = parsed?.user?.id ?? parsed?.currentSession?.user?.id;
      if (typeof userId === 'string') return userId;
    }
    return null;
  } catch {
    return null;
  }
}

/** Repair primary/backup pair and migrate legacy keys before auth client reads storage. */
export function repairSupabaseAuthStorage(): void {
  try {
    migrateLegacySupabaseAuthStorage();

    const key = getSupabaseAuthStorageKey();
    const backupKey = `${key}${BACKUP_SUFFIX}`;
    const primary = localStorage.getItem(key);
    const backup = localStorage.getItem(backupKey);

    if (primary && sessionMatchesCurrentProject(primary)) {
      if (!backup || backup !== primary) localStorage.setItem(backupKey, primary);
    } else if (backup && sessionMatchesCurrentProject(backup)) {
      localStorage.setItem(key, backup);
    } else if (primary && !sessionMatchesCurrentProject(primary)) {
      localStorage.removeItem(key);
      localStorage.removeItem(backupKey);
    }
  } catch {
    /* ignore */
  }
}
