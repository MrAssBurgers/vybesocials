import { getFirebaseConfig, isFirebaseConfigured } from '@/lib/firebase/config';

/**
 * Legacy Supabase project refs — old auth sessions and media URLs may still reference these.
 * Firebase is canonical; these exist only for one-time migration / URL rewrite.
 */
export const KNOWN_LEGACY_SUPABASE_REFS = [
  'eabvbtkxdbttjpdpbmuw',
  'agtcyxjxgkdyoxwxkjth',
  'hprmicwhlaaqfgshucec',
] as const;

export const OBSOLETE_AUTH_REFS = ['eabvbtkxdbttjpdpbmuw'] as const;

const BACKUP_SUFFIX = '-vybe-backup';

function getProjectRef(): string {
  try {
    if (isFirebaseConfigured()) return getFirebaseConfig().projectId;
  } catch {
    /* not configured yet */
  }
  return 'vybe-daaab';
}

function authStorageKeyForRef(projectRef: string): string {
  return `sb-${projectRef}-auth-token`;
}

function readRawSession(key: string): string | null {
  try {
    return localStorage.getItem(key) || localStorage.getItem(`${key}${BACKUP_SUFFIX}`);
  } catch {
    return null;
  }
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

/** Project ref embedded in a legacy Supabase JWT (`iss` / `ref` claim). */
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

export function getLegacyAuthStorageKey(): string {
  return authStorageKeyForRef(getProjectRef());
}

export function getAllLegacyAuthStorageKeys(): string[] {
  const keys = new Set<string>([getLegacyAuthStorageKey()]);
  for (const ref of KNOWN_LEGACY_SUPABASE_REFS) {
    keys.add(authStorageKeyForRef(ref));
  }
  return [...keys];
}

function sessionMatchesCurrentProject(raw: string): boolean {
  const sessionRef = getSessionProjectRefFromRaw(raw);
  if (!sessionRef) return true;
  return sessionRef === getProjectRef() || sessionRef === 'hprmicwhlaaqfgshucec';
}

function writeSessionPair(key: string, value: string): void {
  localStorage.setItem(key, value);
  localStorage.setItem(`${key}${BACKUP_SUFFIX}`, value);
}

function readValidSessionForKey(key: string): string | null {
  const raw = readRawSession(key);
  if (!raw || !sessionMatchesCurrentProject(raw)) return null;
  return raw;
}

export function migrateLegacyAuthStorage(): boolean {
  try {
    const canonicalKey = getLegacyAuthStorageKey();
    const canonical = readValidSessionForKey(canonicalKey);
    if (canonical) {
      writeSessionPair(canonicalKey, canonical);
      return true;
    }

    for (const ref of KNOWN_LEGACY_SUPABASE_REFS) {
      if (ref === getProjectRef()) continue;
      const legacyKey = authStorageKeyForRef(ref);
      const legacyRaw = readRawSession(legacyKey);
      if (!legacyRaw) continue;

      const sessionRef = getSessionProjectRefFromRaw(legacyRaw);
      if (sessionRef && sessionRef !== 'hprmicwhlaaqfgshucec') continue;

      writeSessionPair(canonicalKey, legacyRaw);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/** True when Firebase Auth or a legacy Supabase session exists in localStorage. */
export function hasStoredAuthSession(): boolean {
  try {
    if (Object.keys(localStorage).some((k) => k.startsWith('firebase:authUser:'))) {
      return true;
    }
    for (const key of getAllLegacyAuthStorageKeys()) {
      const raw = readRawSession(key);
      if (raw && sessionMatchesCurrentProject(raw)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Read auth user id from persisted Firebase or legacy Supabase session (sync). */
export function getStoredAuthUserId(): string | null {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('firebase:authUser:')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { uid?: string };
      if (typeof parsed?.uid === 'string') return parsed.uid;
    }

    const canonicalKey = getLegacyAuthStorageKey();
    const keys = [canonicalKey, ...getAllLegacyAuthStorageKeys().filter((k) => k !== canonicalKey)];

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

/** Drop obsolete project auth keys after migration to Firebase. */
export function clearObsoleteAuthStorage(): void {
  try {
    for (const ref of KNOWN_LEGACY_SUPABASE_REFS) {
      if (ref === getProjectRef()) continue;
      const key = authStorageKeyForRef(ref);
      localStorage.removeItem(key);
      localStorage.removeItem(`${key}${BACKUP_SUFFIX}`);
    }
  } catch {
    /* ignore */
  }
}

function purgeWrongProjectAuthSessions(): void {
  try {
    const keys = new Set<string>([
      getLegacyAuthStorageKey(),
      ...KNOWN_LEGACY_SUPABASE_REFS.map(authStorageKeyForRef),
    ]);

    for (const key of keys) {
      const raw = readRawSession(key);
      if (!raw) continue;
      if (sessionMatchesCurrentProject(raw)) continue;
      localStorage.removeItem(key);
      localStorage.removeItem(`${key}${BACKUP_SUFFIX}`);
    }
  } catch {
    /* ignore */
  }
}

/** Repair primary/backup pair and migrate legacy keys before auth client reads storage. */
export function repairLegacyAuthStorage(): void {
  try {
    purgeWrongProjectAuthSessions();
    migrateLegacyAuthStorage();

    const key = getLegacyAuthStorageKey();
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
