import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installAuthSessionKeepAlive, uninstallAuthSessionKeepAlive } from './authSessionKeepAlive';
import './foregroundReadPhase';
const mock = vi.hoisted(() => ({ getSession: vi.fn(), refresh: vi.fn(), stored: true, remember: vi.fn(), auth: { currentUser: { uid: 'alice' } }, generation: 0 }));
vi.mock('@/lib/firebase', () => ({ db: { auth: { getSession: mock.getSession } } }));
vi.mock('@/lib/firebaseAuthRefresh', () => ({ refreshFirebaseSession: mock.refresh }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => mock.auth, getAuthSessionGeneration: () => mock.generation }));
vi.mock('@/lib/legacyAuthStorage', () => ({ hasStoredAuthSession: () => mock.stored }));
vi.mock('@/lib/wasLoggedIn', () => ({ setWasLoggedIn: mock.remember }));
const session = { data: { session: { user: { id: 'alice' } } }, error: null };
let caseNumber = 0;
beforeEach(() => {
  uninstallAuthSessionKeepAlive(); vi.useFakeTimers(); vi.setSystemTime(new Date(Date.parse('2026-10-06T12:00:00Z') + ++caseNumber * 30_000));
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  window.dispatchEvent(new Event('app-resumed'));
  mock.stored = true; mock.getSession.mockReset().mockResolvedValue(session); mock.refresh.mockReset().mockResolvedValue({}); mock.remember.mockReset();
  mock.auth.currentUser = { uid: 'alice' }; mock.generation++;
});
afterEach(() => { uninstallAuthSessionKeepAlive(); vi.useRealTimers(); });
it('does not refresh when initialized in a natively paused visible WebView', async () => {
  window.dispatchEvent(new Event('app-paused')); installAuthSessionKeepAlive();
  await vi.advanceTimersByTimeAsync(20 * 60_000);
  expect(mock.getSession).not.toHaveBeenCalled(); expect(mock.refresh).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('app-resumed')); await vi.advanceTimersByTimeAsync(0);
  expect(mock.refresh).toHaveBeenCalledOnce();
});
it('retires a pending session read if the app pauses before it returns', async () => {
  let resolve!: (value: typeof session) => void;
  mock.getSession.mockReturnValue(new Promise(done => { resolve = done; }));
  installAuthSessionKeepAlive(); window.dispatchEvent(new Event('app-paused')); resolve(session);
  await vi.advanceTimersByTimeAsync(0);
  expect(mock.refresh).not.toHaveBeenCalled(); expect(mock.remember).not.toHaveBeenCalled();
});
it('removes listeners and retires pending work on uninstall', async () => {
  let resolve!: (value: typeof session) => void;
  mock.getSession.mockReturnValue(new Promise(done => { resolve = done; }));
  installAuthSessionKeepAlive(); uninstallAuthSessionKeepAlive(); resolve(session);
  await vi.advanceTimersByTimeAsync(9000); mock.getSession.mockClear(); mock.refresh.mockClear();
  window.dispatchEvent(new Event('app-resumed')); document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(20 * 60_000);
  expect(mock.getSession).not.toHaveBeenCalled(); expect(mock.refresh).not.toHaveBeenCalled();
});
it('does not ask for token refresh when saved session restoration is still pending', async () => {
  mock.getSession.mockResolvedValue({ data: { session: null }, error: { name: 'auth/restore-pending' } });
  installAuthSessionKeepAlive(); await vi.advanceTimersByTimeAsync(0);
  expect(mock.refresh).not.toHaveBeenCalled();
});
it('coalesces startup and a burst of foreground notifications', async () => {
  let resolve!: (value: typeof session) => void;
  mock.getSession.mockReturnValue(new Promise(done => { resolve = done; }));
  installAuthSessionKeepAlive(); document.dispatchEvent(new Event('visibilitychange')); document.dispatchEvent(new Event('visibilitychange'));
  expect(mock.getSession).toHaveBeenCalledOnce(); resolve(session); await vi.advanceTimersByTimeAsync(0);
  expect(mock.refresh).toHaveBeenCalledOnce();
});
it('retires a session read after A to B to A with the same restored UID', async () => {
  let resolve!: (value: typeof session) => void;
  const actor = mock.auth.currentUser;
  mock.getSession.mockReturnValue(new Promise(done => { resolve = done; }));
  installAuthSessionKeepAlive();
  mock.auth.currentUser = { uid: 'bob' }; mock.generation++;
  mock.auth.currentUser = actor; mock.generation++;
  resolve(session); await vi.advanceTimersByTimeAsync(0);
  expect(mock.refresh).not.toHaveBeenCalled(); expect(mock.remember).not.toHaveBeenCalled();
});
it('keeps a confirmed session warm on the existing interval and skips sufficient expiry', async () => {
  installAuthSessionKeepAlive(); await vi.advanceTimersByTimeAsync(0);
  expect(mock.refresh).toHaveBeenCalledOnce();
  mock.getSession.mockResolvedValue({ data: { session: { ...session.data.session, expires_at: Date.now() / 1000 + 3600 } }, error: null });
  await vi.advanceTimersByTimeAsync(20 * 60_000);
  expect(mock.refresh).toHaveBeenCalledOnce();
  mock.getSession.mockResolvedValue(session);
  await vi.advanceTimersByTimeAsync(20 * 60_000);
  expect(mock.refresh).toHaveBeenCalledTimes(2);
});
it('retries normally after a failed read and skips offline work', async () => {
  mock.getSession.mockRejectedValueOnce(Error('Transport unavailable'));
  installAuthSessionKeepAlive(); await vi.advanceTimersByTimeAsync(0);
  expect(mock.refresh).not.toHaveBeenCalled();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  await vi.advanceTimersByTimeAsync(20 * 60_000);
  expect(mock.getSession).toHaveBeenCalledOnce();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  window.dispatchEvent(new Event('app-resumed')); await vi.advanceTimersByTimeAsync(0);
  expect(mock.refresh).toHaveBeenCalledOnce();
});
it('starts a fresh read on a quick real resume while an old foreground read is pending', async () => {
  let resolve!: (value: typeof session) => void;
  mock.getSession.mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValue(session);
  installAuthSessionKeepAlive();
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('app-paused'));
  window.dispatchEvent(new Event('app-resumed'));
  await vi.advanceTimersByTimeAsync(0);
  expect(mock.getSession).toHaveBeenCalledTimes(2);
  expect(mock.refresh).toHaveBeenCalledOnce();
  resolve(session); await vi.advanceTimersByTimeAsync(0);
  expect(mock.refresh).toHaveBeenCalledOnce();
});
