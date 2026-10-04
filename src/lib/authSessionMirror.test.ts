import { describe, expect, it } from 'vitest';
import {
  AUTH_BACKUP_KEY,
  clearMirroredAuth,
  ensureAuthStorageReady,
  firebaseAuthStorageKey,
  mirrorAuthUserJson,
  prefersLocalAuthPersistence,
  resetAuthStoragePrepareForTests,
  seedFirebaseAuthFromBackup,
  setAuthVaultTransportForTests,
  writeAuthVault,
} from './authSessionMirror';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => { data[key] = value; },
    removeItem: (key: string) => { delete data[key]; },
    key: (index: number) => Object.keys(data)[index] ?? null,
    get length() { return Object.keys(data).length; },
    dump: () => data,
  };
}

describe('auth session mirror', () => {
  it('treats a Fold WebView without wv as localStorage auth', () => {
    const fold = 'Mozilla/5.0 (Linux; Android 17; SM-F971N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
    expect(prefersLocalAuthPersistence(fold)).toBe(true);
    expect(prefersLocalAuthPersistence('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false);
  });

  it('copies the backup into the Firebase key before auth starts', () => {
    const storage = memoryStorage({ [AUTH_BACKUP_KEY]: '{"uid":"abc"}' });
    expect(seedFirebaseAuthFromBackup(storage, 'test-key')).toBe(true);
    expect(storage.getItem(firebaseAuthStorageKey('test-key'))).toBe('{"uid":"abc"}');
  });

  it('does not overwrite a session Firebase already stored', () => {
    const key = firebaseAuthStorageKey('test-key');
    const storage = memoryStorage({ [key]: '{"uid":"live"}', [AUTH_BACKUP_KEY]: '{"uid":"old"}' });
    expect(seedFirebaseAuthFromBackup(storage, 'test-key')).toBe(false);
    expect(storage.getItem(key)).toBe('{"uid":"live"}');
  });

  it('clears the backup on sign-out', () => {
    const storage = memoryStorage();
    mirrorAuthUserJson(storage, 'test-key', '{"uid":"abc"}');
    clearMirroredAuth(storage);
    expect(storage.getItem(AUTH_BACKUP_KEY)).toBeNull();
    expect(storage.getItem(firebaseAuthStorageKey('test-key'))).toBeNull();
  });

  it('restores a wiped phone session from the unlocked vault before auth starts', async () => {
    const fold = 'Mozilla/5.0 (Linux; Android 17; SM-F971N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
    const writes: string[] = [];
    resetAuthStoragePrepareForTests();
    setAuthVaultTransportForTests({
      read: async () => '{"uid":"fold-user"}',
      write: (_key, value) => { writes.push(value); },
    });
    localStorage.clear();
    await ensureAuthStorageReady('phone-key', fold);
    expect(localStorage.getItem(firebaseAuthStorageKey('phone-key'))).toBe('{"uid":"fold-user"}');
    expect(localStorage.getItem(AUTH_BACKUP_KEY)).toBe('{"uid":"fold-user"}');
    writeAuthVault('{"uid":"fold-user"}');
    writeAuthVault('{"uid":"fold-user"}');
    writeAuthVault('{"uid":"next"}');
    expect(writes).toEqual(['{"uid":"fold-user"}', '{"uid":"next"}']);
    clearMirroredAuth(localStorage);
    expect(writes.at(-1)).toBe('');
    expect(localStorage.getItem(AUTH_BACKUP_KEY)).toBeNull();
    setAuthVaultTransportForTests(null);
    resetAuthStoragePrepareForTests();
    localStorage.clear();
  });
});
