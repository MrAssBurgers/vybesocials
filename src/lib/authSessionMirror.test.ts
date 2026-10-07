import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_BACKUP_KEY, AUTH_VAULT_KEY, clearMirroredAuth, ensureAuthStorageReady, firebaseAuthStorageKey,
  mirrorAuthUserJson, prefersLocalAuthPersistence, resetAuthStoragePrepareForTests, seedFirebaseAuthFromBackup,
  setAuthVaultTransportForTests, writeAuthVault, flushAuthVault, getAuthRestoreState,
  retireAuthRestore, retryAuthStorage, usableAuthJson, allowExplicitAuthSignIn,
} from './authSessionMirror';
const session = (uid = 'alice', apiKey = 'test-key') => JSON.stringify({ uid, apiKey, emailVerified: true, isAnonymous: false, providerData: [], stsTokenManager: { refreshToken: `refresh-${uid}`, accessToken: `access-${uid}`, expirationTime: 2000000000000 } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { localStorage.clear(); resetAuthStoragePrepareForTests(); setAuthVaultTransportForTests(null); });
afterEach(() => { resetAuthStoragePrepareForTests(); setAuthVaultTransportForTests(null); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('durable native Firebase session mirror', () => {
  it('uses local persistence on Fold WebViews, preserving desktop selection', () => {
    expect(prefersLocalAuthPersistence('Mozilla/5.0 (Linux; Android 17; SM-F971N) Chrome Mobile Safari')).toBe(true);
    expect(prefersLocalAuthPersistence('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false);
  });
  it('restores complete same-project credentials without overwriting an existing session', () => {
    localStorage.setItem(AUTH_BACKUP_KEY, session());
    expect(seedFirebaseAuthFromBackup(localStorage, 'test-key')).toBe(true);
    localStorage.setItem(AUTH_BACKUP_KEY, session('bob'));
    expect(seedFirebaseAuthFromBackup(localStorage, 'test-key')).toBe(false);
    expect(localStorage.getItem(firebaseAuthStorageKey('test-key'))).toBe(session());
  });
  it.each(['{"uid":"alice"}', session('alice', 'other-project'), '{broken', JSON.stringify({ uid: 'alice', apiKey: 'test-key', emailVerified: true, isAnonymous: false, providerData: [], stsTokenManager: { refreshToken: 'r' } })])('rejects invalid/project-mismatched serialization', value => {
    expect(usableAuthJson(value, 'test-key')).toBeNull();
    localStorage.setItem(AUTH_BACKUP_KEY, value);
    expect(seedFirebaseAuthFromBackup(localStorage, 'test-key')).toBe(false);
  });
  it('restores a vault reply inside the boot budget before SDK initialization', async () => {
    setAuthVaultTransportForTests({ read: async () => session(), write: vi.fn() });
    await ensureAuthStorageReady('test-key', 'Android');
    expect(localStorage.getItem(firebaseAuthStorageKey('test-key'))).toBe(session());
    expect(getAuthRestoreState()).toBe('ready');
  });
  it('keeps native recovery pending until credentials can seed Firebase before initialization', async () => {
    vi.useFakeTimers(); const reply = deferred<string | null>();
    setAuthVaultTransportForTests({ read: () => reply.promise, write: vi.fn() });
    const boot = ensureAuthStorageReady('test-key', 'Android'); await vi.advanceTimersByTimeAsync(700);
    expect(getAuthRestoreState()).toBe('pending');
    reply.resolve(session()); await vi.advanceTimersByTimeAsync(0);
    expect(getAuthRestoreState()).toBe('ready');
    await boot; expect(localStorage.getItem(firebaseAuthStorageKey('test-key'))).toBe(session());
  });
  it('retired restore replies cannot rehydrate after explicit logout or account replacement', async () => {
    vi.useFakeTimers(); const reply = deferred<string | null>();
    setAuthVaultTransportForTests({ read: () => reply.promise, write: vi.fn() });
    const boot = ensureAuthStorageReady('test-key', 'Android'); await vi.advanceTimersByTimeAsync(700);
    retireAuthRestore(); reply.resolve(session()); await vi.advanceTimersByTimeAsync(0);
    expect(getAuthRestoreState()).toBe('ready');
  });
  it('opens sign-in after a vault timeout and still lets a later retry win', async () => {
    vi.useFakeTimers(); const old = deferred<string | null>(); let reads = 0;
    setAuthVaultTransportForTests({ read: () => ++reads === 1 ? old.promise : Promise.resolve(session('bob')), write: vi.fn() });
    const boot = ensureAuthStorageReady('test-key', 'Android'); await vi.advanceTimersByTimeAsync(10000); await boot;
    expect(getAuthRestoreState()).toBe('ready');
    expect(localStorage.getItem(AUTH_BACKUP_KEY)).toBeNull();
    await retryAuthStorage('test-key', 'Android'); old.resolve(session()); await vi.advanceTimersByTimeAsync(0);
    expect(localStorage.getItem(AUTH_BACKUP_KEY)).toBe(session('bob')); expect(getAuthRestoreState()).toBe('ready');
  });
  it('does not deduplicate an unconfirmed write; retries identical credentials', async () => {
    let stored: string | null = null; let writes = 0;
    setAuthVaultTransportForTests({ read: async () => stored, write: (_key, value) => { if (++writes > 1) stored = value; } });
    writeAuthVault(session()); expect(await flushAuthVault()).toBe(false);
    writeAuthVault(session()); expect(await flushAuthVault()).toBe(true);
    expect(writes).toBe(2); writeAuthVault(session()); await flushAuthVault(); expect(writes).toBe(2);
  });
  it('clears credentials and persists a logout tombstone that blocks cold-start stale backup adoption', async () => {
    let stored: string | null = session();
    setAuthVaultTransportForTests({ read: async () => stored, write: (_key, value) => { stored = value; } });
    mirrorAuthUserJson(localStorage, 'test-key', session()); clearMirroredAuth(localStorage); await flushAuthVault();
    expect(stored).toContain('signed-out'); expect(localStorage.getItem(AUTH_BACKUP_KEY)).toBeNull();
    localStorage.setItem(AUTH_BACKUP_KEY, session()); resetAuthStoragePrepareForTests();
    await ensureAuthStorageReady('test-key', 'Android');
    expect(localStorage.getItem(firebaseAuthStorageKey('test-key'))).toBeNull();
    allowExplicitAuthSignIn(); expect(seedFirebaseAuthFromBackup(localStorage, 'test-key')).toBe(true);
  });
  it('observes a synchronous native response before dispatch can erase it', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Despia Android');
    Object.defineProperty(window, 'despia', { configurable: true, set: () => { (window as any)[AUTH_VAULT_KEY] = encodeURIComponent(session()); } });
    await ensureAuthStorageReady('test-key', 'Android');
    expect(localStorage.getItem(AUTH_BACKUP_KEY)).toBe(session());
    delete (window as any).despia; delete (window as any)[AUTH_VAULT_KEY];
  });
  it('drains a retired native callback before dispatching a retry into the shared callback slot', async () => {
    vi.useFakeTimers(); vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Despia Android');
    let commands = 0;
    Object.defineProperty(window, 'despia', { configurable: true, set: () => {
      if (++commands === 2) (window as any)[AUTH_VAULT_KEY] = encodeURIComponent(session('bob'));
    } });
    const boot = ensureAuthStorageReady('test-key', 'Android'); await vi.advanceTimersByTimeAsync(10000); await boot;
    expect(getAuthRestoreState()).toBe('ready');
    const retry = retryAuthStorage('test-key', 'Android'); await vi.advanceTimersByTimeAsync(100);
    expect(commands).toBe(1);
    (window as any)[AUTH_VAULT_KEY] = encodeURIComponent(session('alice'));
    await vi.advanceTimersByTimeAsync(100); await retry;
    expect(commands).toBe(2); expect(localStorage.getItem(AUTH_BACKUP_KEY)).toBe(session('bob'));
    delete (window as any).despia; delete (window as any)[AUTH_VAULT_KEY];
  });
  it('treats native n/a as first use and opens sign-in, same as a confirmed empty vault', async () => {
    vi.useFakeTimers(); vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Despia Android');
    Object.defineProperty(window, 'despia', { configurable: true, set: () => { (window as any)[AUTH_VAULT_KEY] = 'n/a'; } });
    const boot = ensureAuthStorageReady('test-key', 'Android'); await vi.advanceTimersByTimeAsync(10000); await boot;
    expect(getAuthRestoreState()).toBe('ready'); expect(localStorage.getItem(AUTH_BACKUP_KEY)).toBeNull();
    resetAuthStoragePrepareForTests();
    Object.defineProperty(window, 'despia', { configurable: true, set: () => { (window as any)[AUTH_VAULT_KEY] = ''; } });
    await ensureAuthStorageReady('test-key', 'Android'); expect(getAuthRestoreState()).toBe('ready');
    delete (window as any).despia; delete (window as any)[AUTH_VAULT_KEY];
  });
  it('automatically retries an unconfirmed write without a new token event', async () => {
    vi.useFakeTimers(); let saved: string | null = null, writes = 0;
    setAuthVaultTransportForTests({ read: async () => saved, write: (_key, value) => { if (++writes === 2) saved = value; } });
    writeAuthVault(session()); expect(await flushAuthVault()).toBe(false);
    await vi.advanceTimersByTimeAsync(1500);
    expect(saved).toBe(session()); expect(writes).toBe(2); expect(await flushAuthVault()).toBe(true);
  });
});
