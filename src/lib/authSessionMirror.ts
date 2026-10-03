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

export function clearMirroredAuth(storage: Pick<Storage, 'getItem' | 'removeItem' | 'key'> & { length: number }) {
  storage.removeItem(AUTH_BACKUP_KEY);
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith('firebase:authUser:')) keys.push(key);
  }
  keys.forEach((key) => storage.removeItem(key));
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

/** Seed localStorage, then spend at most ~400ms copying an IndexedDB session across. */
export function ensureAuthStorageReady(apiKey: string, ua = ''): Promise<void> {
  if (preparePromise) return preparePromise;
  const storage = typeof localStorage === 'undefined' ? null : localStorage;
  if (storage) seedFirebaseAuthFromBackup(storage, apiKey);
  if (!apiKey || !storage || !prefersLocalAuthPersistence(ua) || typeof indexedDB === 'undefined') {
    prepareDone = true;
    preparePromise = Promise.resolve();
    return preparePromise;
  }
  if (storage.getItem(firebaseAuthStorageKey(apiKey))) {
    prepareDone = true;
    preparePromise = Promise.resolve();
    return preparePromise;
  }
  prepareDone = false;
  preparePromise = (async () => {
    const copied = await readIndexedDbAuth(apiKey, 350);
    if (copied) mirrorAuthUserJson(storage, apiKey, copied);
    else seedFirebaseAuthFromBackup(storage, apiKey);
  })().finally(() => {
    prepareDone = true;
  });
  return preparePromise;
}
