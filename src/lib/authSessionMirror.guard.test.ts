import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AUTH_BACKUP_KEY, clearMirroredAuth, firebaseAuthStorageKey, mirrorAuthUserJson, setAuthVaultTransportForTests, resetAuthStoragePrepareForTests, writeAuthVault, flushAuthVault } from './authSessionMirror';
const session = (uid: string) => JSON.stringify({ uid, apiKey: 'qa-key', emailVerified: true, isAnonymous: false, providerData: [], stsTokenManager: { refreshToken: uid, accessToken: uid, expirationTime: 2000000000000 } });
beforeEach(() => { localStorage.clear(); resetAuthStoragePrepareForTests(); });
afterEach(() => { resetAuthStoragePrepareForTests(); setAuthVaultTransportForTests(null); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });
it.each(['new-login', 'logout'])('reasserts %s after an older timed-out write completes late', async intent => {
  vi.useFakeTimers(); let release!: () => void; const old = new Promise<void>(resolve => { release = resolve; });
  let stored: string | null = null; let calls = 0;
  setAuthVaultTransportForTests({ read: async () => stored, write: async (_key, value) => { if (++calls === 1) await old; stored = value; } });
  writeAuthVault(session('alice')); await vi.advanceTimersByTimeAsync(1200);
  if (intent === 'new-login') writeAuthVault(session('bob')); else clearMirroredAuth(localStorage);
  expect(await flushAuthVault()).toBe(true); const expected = stored;
  release(); await vi.advanceTimersByTimeAsync(0); await flushAuthVault();
  expect(stored).toBe(expected); expect(calls).toBe(3);
});
it('a queued logout yields to a new login and cannot overwrite its native credentials', async () => {
  let release!: () => void; const delayed = new Promise<void>(r => { release = r; }); let stored = session('alice'); const values: string[] = [];
  setAuthVaultTransportForTests({ read: async () => stored, write: async (_key, value) => { values.push(value); if (values.length === 1) await delayed; stored = value; } });
  let version = 1; const guard = () => { if (version !== 1) throw Error('Retired attempt'); };
  clearMirroredAuth(localStorage, guard); version++;
  mirrorAuthUserJson(localStorage, 'qa-key', session('bob')); writeAuthVault(session('bob'));
  release(); await flushAuthVault();
  expect(stored).toBe(session('bob')); expect(values.at(-1)).toBe(session('bob'));
  expect(localStorage.getItem(AUTH_BACKUP_KEY)).toBe(session('bob'));
});
it('rejects retired cleanup before removing current credentials', () => {
  mirrorAuthUserJson(localStorage, 'qa-key', session('bob'));
  expect(() => clearMirroredAuth(localStorage, () => { throw Error('Retired attempt'); })).toThrow('Retired attempt');
  expect(localStorage.getItem(firebaseAuthStorageKey('qa-key'))).toBe(session('bob'));
});
