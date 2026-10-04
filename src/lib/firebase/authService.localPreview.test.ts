import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ local: true, mobile: false, ready: true, auth: { currentUser: null as any }, initialize: vi.fn(), signOut: vi.fn(), listener: null as any, connect: vi.fn() }));
vi.mock('./localPreview', () => ({ isLocalPreview: () => mock.local }));
vi.mock('./app', () => ({ getFirebaseApp: () => ({ name: '[DEFAULT]' }) }));
vi.mock('./emulators', () => ({ connectLocalPreviewAuth: mock.connect }));
vi.mock('./config', () => ({ isFirebaseConfigured: () => true, getFirebaseConfig: () => ({ apiKey: mock.local ? 'demo-vybe-preview-key' : 'production-test-key' }) }));
vi.mock('./firestoreDb', () => ({ setDocument: vi.fn() }));
vi.mock('firebase/auth', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/auth')>(),
  initializeAuth: mock.initialize,
  getAuth: () => mock.auth,
  onAuthStateChanged: (_auth: unknown, listener: unknown) => { mock.listener = listener; return () => {}; },
  signOut: mock.signOut,
}));
vi.mock('@/lib/authSessionMirror', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/authSessionMirror')>();
  return { ...real, ensureAuthStorageReady: vi.fn(real.ensureAuthStorageReady),
    seedFirebaseAuthFromBackup: vi.fn(real.seedFirebaseAuthFromBackup), mirrorAuthUserJson: vi.fn(real.mirrorAuthUserJson),
    clearMirroredAuth: vi.fn(real.clearMirroredAuth), prefersLocalAuthPersistence: () => mock.mobile, isAuthStorageReady: () => mock.ready };
});
const backupKey = 'vybe.auth.user';
const productionKey = 'firebase:authUser:production-test-key:[DEFAULT]';
const demoKey = 'firebase:authUser:demo-vybe-preview-key:[DEFAULT]';
const productionBackup = JSON.stringify({ uid: 'synthetic-production-user', apiKey: 'production-test-key' });
function user() { return { uid: 'demo-user', providerData: [], metadata: {}, email: 'alice@vybe.test', emailVerified: true, refreshToken: 'demo-only', getIdToken: vi.fn(async () => 'demo-only'), toJSON: vi.fn(() => ({ uid: 'demo-user', apiKey: 'demo-vybe-preview-key' })) }; }
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); mock.local = true; mock.mobile = false; mock.ready = true; mock.auth = { currentUser: null }; mock.listener = null;
  mock.initialize.mockReturnValue(mock.auth); mock.signOut.mockResolvedValue(undefined);
  localStorage.setItem(backupKey, productionBackup); localStorage.setItem(productionKey, productionBackup);
});

describe('isolated preview authentication persistence', () => {
  it.each([false, true])('uses session-only persistence and never seeds the production backup (mobile=%s)', async mobile => {
    mock.mobile = mobile; mock.ready = false;
    const { browserSessionPersistence } = await import('firebase/auth');
    const { getFirebaseAuth, firebaseAuth } = await import('./authService');
    const mirror = await import('@/lib/authSessionMirror');
    expect(getFirebaseAuth()).toBe(mock.auth);
    await firebaseAuth.getSession();
    expect(mock.initialize).toHaveBeenCalledWith(expect.any(Object), { persistence: [browserSessionPersistence] });
    expect(mirror.ensureAuthStorageReady).not.toHaveBeenCalled();
    expect(mirror.seedFirebaseAuthFromBackup).not.toHaveBeenCalled();
    expect(localStorage.getItem(demoKey)).toBeNull();
    expect(localStorage.getItem(backupKey)).toBe(productionBackup);
    expect(localStorage.getItem(productionKey)).toBe(productionBackup);
  });
  it('does not mirror demo auth events into the normal backup', async () => {
    const { firebaseAuth } = await import('./authService');
    const mirror = await import('@/lib/authSessionMirror');
    const callback = vi.fn(); const subscription = firebaseAuth.onAuthStateChange(callback);
    await Promise.resolve(); await Promise.resolve();
    const demo = user(); mock.listener(demo);
    expect(callback).toHaveBeenCalledWith('INITIAL_SESSION', expect.objectContaining({ user: expect.objectContaining({ id: 'demo-user' }) }));
    expect(mirror.mirrorAuthUserJson).not.toHaveBeenCalled(); expect(demo.toJSON).not.toHaveBeenCalled();
    expect(localStorage.getItem(backupKey)).toBe(productionBackup);
    expect(localStorage.getItem(demoKey)).toBeNull();
    subscription.data.subscription.unsubscribe();
  });
  it('signs out the demo session without clearing production backup or auth keys', async () => {
    const { firebaseAuth } = await import('./authService');
    const mirror = await import('@/lib/authSessionMirror');
    expect(await firebaseAuth.signOut()).toEqual({ error: null });
    expect(mock.signOut).toHaveBeenCalledWith(mock.auth);
    expect(mirror.clearMirroredAuth).not.toHaveBeenCalled();
    expect(localStorage.getItem(backupKey)).toBe(productionBackup);
    expect(localStorage.getItem(productionKey)).toBe(productionBackup);
  });
  it.each([false, true])('preserves normal persistence, recovery, mirroring and sign-out behavior (mobile=%s)', async mobile => {
    mock.local = false; mock.mobile = mobile; localStorage.removeItem(productionKey);
    const { browserSessionPersistence, browserLocalPersistence, indexedDBLocalPersistence } = await import('firebase/auth');
    const { firebaseAuth } = await import('./authService');
    const mirror = await import('@/lib/authSessionMirror');
    await firebaseAuth.getSession();
    expect(mock.initialize).toHaveBeenCalledWith(expect.any(Object), { persistence: mobile ? [browserLocalPersistence, browserSessionPersistence] : [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] });
    expect(mirror.ensureAuthStorageReady).toHaveBeenCalled();
    expect(mirror.seedFirebaseAuthFromBackup).toHaveBeenCalled();
    expect(localStorage.getItem(productionKey)).toBe(productionBackup);
    const subscription = firebaseAuth.onAuthStateChange(vi.fn()); await Promise.resolve(); await Promise.resolve();
    const signedIn = user(); mock.listener(signedIn);
    expect(mirror.mirrorAuthUserJson).toHaveBeenCalled();
    expect(localStorage.getItem(backupKey)).toBe(JSON.stringify(signedIn.toJSON()));
    await firebaseAuth.signOut();
    expect(mirror.clearMirroredAuth).toHaveBeenCalled();
    expect(localStorage.getItem(backupKey)).toBeNull(); expect(localStorage.getItem(productionKey)).toBeNull();
    subscription.data.subscription.unsubscribe();
  });
});
