/**
 * Android WebView (including Galaxy Z Fold, which has no "; wv") drops
 * IndexedDB when the process is killed. Firebase then looks logged out.
 * Keep a localStorage copy and prefer that persistence on phones.
 */

export const AUTH_BACKUP_KEY = 'vybe.auth.user';

export function firebaseAuthStorageKey(apiKey: string): string {
  return `firebase:authUser:${apiKey}:[DEFAULT]`;
}

export function prefersLocalAuthPersistence(ua: string): boolean {
  return /android|iphone|ipad|ipod|despia|vybeapp|; wv\)|\bwv\b/i.test(ua);
}

export function seedFirebaseAuthFromBackup(storage: Pick<Storage, 'getItem' | 'setItem'>, apiKey: string): boolean {
  if (!apiKey) return false;
  const key = firebaseAuthStorageKey(apiKey);
  if (storage.getItem(key)) return false;
  const backup = storage.getItem(AUTH_BACKUP_KEY);
  if (!backup) return false;
  storage.setItem(key, backup);
  return true;
}

export function mirrorAuthUserJson(storage: Pick<Storage, 'setItem'>, apiKey: string, json: string) {
  if (!apiKey || !json) return;
  storage.setItem(firebaseAuthStorageKey(apiKey), json);
  storage.setItem(AUTH_BACKUP_KEY, json);
}

export function clearMirroredAuth(storage: Pick<Storage, 'getItem' | 'removeItem' | 'key'> & { length: number }, guard: () => void = () => {}) {
  guard();
  storage.removeItem(AUTH_BACKUP_KEY);
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith('firebase:authUser:')) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
  clearAuthVault(guard);
}

/** Unlocked Despia vault copy. Play Store WebViews wipe localStorage on quit. */
export const AUTH_VAULT_KEY = 'vybe_auth_user';

type VaultRead = (key: string, timeoutMs: number) => Promise<string | null>;
type VaultWrite = (key: string, value: string) => void;
let vaultRead: VaultRead | null = null;
let vaultWrite: VaultWrite | null = null;
let lastVaultJson = '';

export function setAuthVaultTransportForTests(transport: { read: VaultRead; write: VaultWrite } | null) {
  vaultRead = transport?.read ?? null;
  vaultWrite = transport?.write ?? null;
  lastVaultJson = '';
}

export function usableAuthJson(value: string | null): string | null {
  if (!value || value.length > 200_000) return null;
  try {
    const parsed = JSON.parse(value) as { uid?: unknown; localId?: unknown };
    if (parsed && (typeof parsed.uid === 'string' || typeof parsed.localId === 'string')) return value;
  } catch { /* ignore */ }
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}

async function readDespiaVault(timeoutMs: number): Promise<string | null> {
  if (vaultRead) return vaultRead(AUTH_VAULT_KEY, timeoutMs);
  try {
    const mod = await withTimeout(import('despia-native'), timeoutMs);
    const despia = mod && ((mod as { default?: unknown }).default || mod);
    if (typeof despia !== 'function') return null;
    const data = await withTimeout(
      Promise.resolve(despia(`readvault://?key=${AUTH_VAULT_KEY}`, [AUTH_VAULT_KEY])),
      timeoutMs,
    );
    const raw = data && typeof data === 'object' ? (data as Record<string, unknown>)[AUTH_VAULT_KEY] : null;
    if (typeof raw !== 'string' || !raw) return null;
    try { return decodeURIComponent(raw); } catch { return raw; }
  } catch {
    return null;
  }
}

function nativeVaultLikely(): boolean {
  if (vaultRead || vaultWrite) return true;
  if (typeof navigator === 'undefined') return false;
  return prefersLocalAuthPersistence(navigator.userAgent || '');
}

export function writeAuthVault(json: string) {
  const usable = usableAuthJson(json);
  if (!usable || usable === lastVaultJson) return;
  lastVaultJson = usable;
  if (!nativeVaultLikely()) return;
  if (vaultWrite) {
    vaultWrite(AUTH_VAULT_KEY, usable);
    return;
  }
  void import('despia-native').then((mod) => {
    const despia = (mod as { default?: unknown }).default || mod;
    if (typeof despia !== 'function') return;
    void despia(`setvault://?key=${AUTH_VAULT_KEY}&value=${encodeURIComponent(usable)}&locked=false`);
  }).catch(() => { /* browser without the native bridge */ });
}

export function clearAuthVault(guard: () => void = () => {}) {
  guard();
  lastVaultJson = '';
  if (!nativeVaultLikely()) return;
  if (vaultWrite) {
    vaultWrite(AUTH_VAULT_KEY, '');
    return;
  }
  void import('despia-native').then((mod) => {
    guard();
    const despia = (mod as { default?: unknown }).default || mod;
    if (typeof despia !== 'function') return;
    void despia(`setvault://?key=${AUTH_VAULT_KEY}&value=&locked=false`);
  }).catch(() => {});
}

export async function readAuthVault(timeoutMs = 700): Promise<string | null> {
  return usableAuthJson(await readDespiaVault(timeoutMs));
}

let preparePromise: Promise<void> | null = null;
let prepareDone = true;

export function isAuthStorageReady(): boolean {
  return prepareDone;
}

async function readIndexedDbAuth(apiKey: string, timeoutMs: number): Promise<string | null> {
  if (typeof indexedDB === 'undefined') return null;
  const key = firebaseAuthStorageKey(apiKey);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open('firebaseLocalStorageDb');
    } catch {
      clearTimeout(timer);
      finish(null);
      return;
    }
    request.onupgradeneeded = () => {
      try { request.transaction?.abort(); } catch { /* empty db — don't create one */ }
      clearTimeout(timer);
      finish(null);
    };
    request.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction('firebaseLocalStorage', 'readonly');
        const getReq = tx.objectStore('firebaseLocalStorage').get(key);
        getReq.onsuccess = () => {
          const row = getReq.result as { value?: unknown } | undefined;
          const value = row?.value ?? null;
          clearTimeout(timer);
          try { db.close(); } catch { /* ignore */ }
          if (!value) {
            finish(null);
            return;
          }
          finish(typeof value === 'string' ? value : JSON.stringify(value));
        };
        getReq.onerror = () => {
          clearTimeout(timer);
          try { db.close(); } catch { /* ignore */ }
          finish(null);
        };
      } catch {
        clearTimeout(timer);
        try { db.close(); } catch { /* ignore */ }
        finish(null);
      }
    };
  });
}

export function resetAuthStoragePrepareForTests() {
  preparePromise = null;
  prepareDone = true;
}

/** Seed localStorage, then the native vault, then IndexedDB. Phones wait at most ~700ms. */
export function ensureAuthStorageReady(apiKey: string, ua = ''): Promise<void> {
  if (preparePromise) return preparePromise;
  const storage = typeof localStorage === 'undefined' ? null : localStorage;
  if (storage) seedFirebaseAuthFromBackup(storage, apiKey);
  const key = apiKey ? firebaseAuthStorageKey(apiKey) : '';
  const needsVault = !!apiKey && !!storage && prefersLocalAuthPersistence(ua) && !storage.getItem(key);
  const needsIdb = needsVault && typeof indexedDB !== 'undefined';
  if (!needsVault && !needsIdb) {
    prepareDone = true;
    preparePromise = Promise.resolve();
    return preparePromise;
  }
  prepareDone = false;
  preparePromise = (async () => {
    if (!storage || !apiKey) return;
    if (!storage.getItem(key)) {
      const fromVault = await readAuthVault(700);
      if (fromVault) mirrorAuthUserJson(storage, apiKey, fromVault);
    }
    if (!storage.getItem(key) && typeof indexedDB !== 'undefined') {
      const copied = await readIndexedDbAuth(apiKey, 350);
      if (copied) mirrorAuthUserJson(storage, apiKey, copied);
      else seedFirebaseAuthFromBackup(storage, apiKey);
    }
  })().finally(() => {
    prepareDone = true;
  });
  return preparePromise;
}
