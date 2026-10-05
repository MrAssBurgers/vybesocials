import { afterEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  return { release, ready, bridge: vi.fn() };
});
vi.mock('despia-native', async () => { await native.ready; return { default: native.bridge }; });
import { AUTH_BACKUP_KEY, clearMirroredAuth, firebaseAuthStorageKey, mirrorAuthUserJson } from './authSessionMirror';
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

it('a retired soft-sign-out cannot clear the new native vault after a delayed bridge import', async () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android VybeApp');
  let version = 1;
  const guard = () => { if (version !== 1) throw Error('Retired attempt'); };
  mirrorAuthUserJson(localStorage, 'qa-key', '{"uid":"alice"}');
  clearMirroredAuth(localStorage, guard);
  expect(localStorage.getItem(AUTH_BACKUP_KEY)).toBeNull();
  version++;
  mirrorAuthUserJson(localStorage, 'qa-key', '{"uid":"bob"}');
  native.release();
  await vi.dynamicImportSettled();
  expect(native.bridge).not.toHaveBeenCalled();
  expect(localStorage.getItem(firebaseAuthStorageKey('qa-key'))).toBe('{"uid":"bob"}');
  expect(localStorage.getItem(AUTH_BACKUP_KEY)).toBe('{"uid":"bob"}');
});

it('rejects retired cleanup before removing any current disk credentials', () => {
  mirrorAuthUserJson(localStorage, 'qa-key', '{"uid":"bob"}');
  expect(() => clearMirroredAuth(localStorage, () => { throw Error('Retired attempt'); })).toThrow('Retired attempt');
  expect(localStorage.getItem(firebaseAuthStorageKey('qa-key'))).toBe('{"uid":"bob"}');
  expect(localStorage.getItem(AUTH_BACKUP_KEY)).toBe('{"uid":"bob"}');
});
