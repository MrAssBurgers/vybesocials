import { afterEach, beforeEach, expect, it, vi } from 'vitest';
// Real browser Firebase SDK + isolated Auth emulator only, never a production probe.
const h = vi.hoisted(() => ({ main: null as any, signOuts: 0, port: process.env.VYBE_AUTH_PERSISTENCE_EMULATOR, connected: new WeakSet<object>() }));
vi.mock('./localPreview', () => ({ isLocalPreview: () => false }));
vi.mock('./config', () => ({ isFirebaseConfigured: () => true, getFirebaseConfig: () => ({ apiKey: 'demo-persistence-key', projectId: 'demo-vybe-persistence', authDomain: 'localhost', appId: 'demo-persistence-app' }) }));
vi.mock('./app', () => ({ getFirebaseApp: () => h.main }));
vi.mock('./emulators', async () => {
  const { connectAuthEmulator } = await import('firebase/auth');
  return { connectLocalPreviewAuth: (auth: any) => { if (!h.connected.has(auth)) { h.connected.add(auth); connectAuthEmulator(auth, `http://127.0.0.1:${h.port}`, { disableWarnings: true }); } } };
});
// Node SDK persistence is memory-only. Use the production browser distribution,
// with all public Auth methods real and connected only to the isolated emulator.
vi.mock('firebase/auth', async () => {
  // @ts-expect-error The browser distribution has the same public SDK exports.
  const real = await import('../../../node_modules/@firebase/auth/dist/esm/index.js');
  return { ...real, signOut: (auth: any) => { h.signOuts++; return real.signOut(auth); } };
});
let apps: any[] = [], serialized = '', uid = '';
let mirror: typeof import('@/lib/authSessionMirror');
const subscriptions: Array<() => void> = [];
const enabled = h.port === '9296';
beforeEach(async () => {
  if (!h.port) return;
  if (!enabled) throw Error('Fixture is restricted to isolated Auth9296.');
  vi.resetModules(); h.connected = new WeakSet(); apps = []; localStorage.clear(); sessionStorage.clear();
  const { initializeApp } = await import('firebase/app');
  const { initializeAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut } = await import('firebase/auth');
  const options = { apiKey: 'demo-persistence-key', projectId: 'demo-vybe-persistence', authDomain: 'localhost', appId: 'demo-persistence-app' };
  const seedApp = initializeApp(options, `seed-${crypto.randomUUID()}`); apps.push(seedApp);
  const seed = initializeAuth(seedApp, { persistence: [] }); connectAuthEmulator(seed, 'http://127.0.0.1:9296', { disableWarnings: true });
  const user = (await createUserWithEmailAndPassword(seed, `alice-${crypto.randomUUID()}@vybe.test`, 'qa-password-only')).user;
  serialized = JSON.stringify(user.toJSON()); uid = user.uid; await signOut(seed);
  h.main = initializeApp(options, '[DEFAULT]'); apps.push(h.main);
  mirror = await import('@/lib/authSessionMirror'); mirror.resetAuthStoragePrepareForTests();
});
afterEach(async () => {
  if (!enabled) return;
  vi.restoreAllMocks();
  subscriptions.splice(0).forEach(unsubscribe => unsubscribe());
  mirror.resetAuthStoragePrepareForTests(); mirror.setAuthVaultTransportForTests(null);
  const { deleteApp } = await import('firebase/app'); await Promise.all(apps.map(app => deleteApp(app)));
});
async function observe() {
  const service = await import('./authService'); const events: Array<[string, any]> = [];
  subscriptions.push(service.firebaseAuth.onAuthStateChange((event, session) => events.push([event, session])).data.subscription.unsubscribe);
  return { service, events };
}
it.skipIf(!enabled)('real browser SDK hydrates delayed native credentials without initializing auth early', async () => {
  let release!: (json: string) => void; const vault = new Promise<string>(resolve => { release = resolve; }); let saved: string | null = null;
  mirror.setAuthVaultTransportForTests({ read: () => saved ? Promise.resolve(saved) : vault, write: (_key, json) => { saved = json; } });
  const { service, events } = await observe(); await new Promise(resolve => setTimeout(resolve, 800));
  expect(service.getAuthRestoreState()).toBe('pending'); expect(service.getFirebaseAuth()).toBeNull(); expect(events).toEqual([]);
  release(serialized);
  await vi.waitFor(() => expect(service.getFirebaseAuth()?.currentUser?.uid).toBe(uid), { timeout: 10000 });
  expect(service.getAuthRestoreState()).toBe('ready');
  await vi.waitFor(() => expect(events.some(([event, session]) => event === 'INITIAL_SESSION' && session?.user.id === uid)).toBe(true));
  expect(events.some(([, session]) => session === null)).toBe(false);
}, 15000);
it.skipIf(!enabled)('a vault that never answers opens sign-in instead of staying on the restore screen', async () => {
  mirror.setAuthVaultTransportForTests({ read: async () => { throw Error('No native reply'); }, write: vi.fn() });
  const { service, events } = await observe();
  await vi.waitFor(() => expect(service.getAuthRestoreState()).toBe('ready'));
  await vi.waitFor(() => expect(events).toContainEqual(['INITIAL_SESSION', null]));
  expect(service.getFirebaseAuth()?.currentUser).toBeNull();
});
it.skipIf(!enabled)('Sign in again from a missing vault still leaves a signed-out shell', async () => {
  let saved: string | null = null;
  mirror.setAuthVaultTransportForTests({ read: async () => { if (!saved) throw Error('Unknown first-use vault'); return saved; }, write: (_key, value) => { saved = value; } });
  const { service, events } = await observe();
  await vi.waitFor(() => expect(service.getAuthRestoreState()).toBe('ready'));
  await service.abandonAuthRestore();
  await vi.waitFor(() => expect(events).toContainEqual(['INITIAL_SESSION', null]));
  expect(service.getAuthRestoreState()).toBe('ready'); expect(service.getFirebaseAuth()?.currentUser).toBeNull(); expect(saved).toContain('signed-out');
});
it.skipIf(!enabled)('cold-start logout tombstone defeats surviving real SDK persistence before any user event', async () => {
  mirror.clearMirroredAuth(localStorage);
  localStorage.setItem(mirror.firebaseAuthStorageKey('demo-persistence-key'), serialized);
  mirror.resetAuthStoragePrepareForTests();
  const before = h.signOuts;
  const { service, events } = await observe();
  await Promise.all([service.firebaseAuth.getSession(), service.firebaseAuth.getSession()]);
  await vi.waitFor(() => expect(service.getAuthRestoreState()).toBe('ready'));
  expect(h.signOuts - before).toBe(1);
  expect(service.getFirebaseAuth()?.currentUser).toBeNull();
  expect(events).toEqual([['INITIAL_SESSION', null]]);
  expect(localStorage.getItem(mirror.AUTH_BACKUP_KEY)).toBeNull();
  expect(localStorage.getItem(mirror.firebaseAuthStorageKey('demo-persistence-key'))).toBeNull();
});
it.skipIf(!enabled)('a normal local saved session initializes without waiting for native lookup', async () => {
  const nativeRead = vi.fn(async () => { throw Error('Should not read native vault'); });
  mirror.setAuthVaultTransportForTests({ read: nativeRead, write: vi.fn() });
  localStorage.setItem(mirror.firebaseAuthStorageKey('demo-persistence-key'), serialized);
  const { service } = await observe();
  expect(service.getFirebaseAuth()).not.toBeNull();
  await vi.waitFor(() => expect(service.getAuthRestoreState()).toBe('ready'));
  expect(service.getFirebaseAuth()?.currentUser?.uid).toBe(uid);
  // Token mirroring may verify a native write, but it never held up initialization.
});
it.skipIf(!enabled)('valid native credentials restore through real session persistence when localStorage writes fail', async () => {
  let saved = serialized;
  mirror.setAuthVaultTransportForTests({ read: async () => saved, write: (_key, value) => { saved = value; } });
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw Error('Local persistence unavailable'); });
  const { service, events } = await observe();
  await vi.waitFor(() => expect(service.getAuthRestoreState()).toBe('ready'));
  expect(service.getFirebaseAuth()?.currentUser?.uid).toBe(uid);
  expect(events.some(([, session]) => session?.user.id === uid)).toBe(true);
  expect(JSON.parse(sessionStorage.getItem(mirror.firebaseAuthStorageKey('demo-persistence-key'))!).uid).toBe(uid);
});
