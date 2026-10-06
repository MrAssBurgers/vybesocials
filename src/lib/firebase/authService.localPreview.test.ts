import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ local: true, mobile: false, ready: true, auth: { currentUser: null as any, authStateReady: async () => {} }, initialize: vi.fn(), signOut: vi.fn(), listener: null as any, authObserver: null as any, tokens: new Set<any>(), connect: vi.fn() }));
vi.mock('./localPreview', () => ({ isLocalPreview: () => mock.local }));
vi.mock('./app', () => ({ getFirebaseApp: () => ({ name: '[DEFAULT]' }) }));
vi.mock('./emulators', () => ({ connectLocalPreviewAuth: mock.connect }));
vi.mock('./config', () => ({ isFirebaseConfigured: () => true, getFirebaseConfig: () => ({ apiKey: mock.local ? 'demo-vybe-preview-key' : 'production-test-key' }) }));
vi.mock('./firestoreDb', () => ({ setDocument: vi.fn() }));
vi.mock('firebase/auth', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/auth')>(),
  initializeAuth: mock.initialize,
  getAuth: () => mock.auth,
  onAuthStateChanged: (_auth: unknown, listener: any) => { mock.authObserver = listener; mock.listener = (user: any) => { mock.auth.currentUser = user; listener(user); }; return () => {}; },
  onIdTokenChanged: (_auth: unknown, listener: any) => { mock.tokens.add(listener); mock.listener = (user: any) => { mock.auth.currentUser = user; mock.tokens.forEach(notify => notify(user)); }; return () => { mock.tokens.delete(listener); }; },
  beforeAuthStateChanged: () => () => {},
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
const tokenManager = { refreshToken: 'synthetic-refresh', accessToken: 'synthetic-access', expirationTime: 2000000000000 };
const productionBackup = JSON.stringify({ uid: 'synthetic-production-user', apiKey: 'production-test-key', emailVerified: true, isAnonymous: false, providerData: [], stsTokenManager: tokenManager });
function user() { return { uid: 'demo-user', providerData: [], metadata: {}, email: 'alice@vybe.test', emailVerified: true, refreshToken: 'demo-only', getIdToken: vi.fn(async () => 'demo-only'), toJSON: vi.fn(() => ({ uid: 'demo-user', apiKey: mock.local ? 'demo-vybe-preview-key' : 'production-test-key', emailVerified: true, isAnonymous: false, providerData: [], stsTokenManager: tokenManager })) }; }
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); mock.local = true; mock.mobile = false; mock.ready = true; mock.auth = { currentUser: null, authStateReady: async () => {} }; mock.listener = null; mock.authObserver = null; mock.tokens.clear();
  mock.initialize.mockReturnValue(mock.auth); mock.signOut.mockResolvedValue(undefined);
  localStorage.setItem(backupKey, productionBackup); localStorage.setItem(productionKey, productionBackup);
});

describe('isolated preview authentication persistence', () => {
  it('recovers failed token transport on native resume without another SDK token event', async () => {
    const { firebaseAuth } = await import('./authService');
    const callback = vi.fn(); const subscription = firebaseAuth.onAuthStateChange(callback);
    await Promise.resolve(); await Promise.resolve();
    const alice = user(); alice.getIdToken.mockRejectedValueOnce(Object.assign(new Error('Network unavailable'), { code: 'auth/network-request-failed' }));
    mock.listener(alice);
    await vi.waitFor(() => expect(alice.getIdToken).toHaveBeenCalledOnce());
    await new Promise(resolve => setTimeout(resolve, 50));
    alice.getIdToken.mockResolvedValue('resume-token'); callback.mockClear();
    window.dispatchEvent(new Event('app-resumed'));
    try {
      await vi.waitFor(() => expect(callback).toHaveBeenCalledWith('TOKEN_REFRESHED', expect.objectContaining({ access_token: 'resume-token' })));
      expect(callback).not.toHaveBeenCalledWith('SIGNED_IN', expect.anything());
    } finally { subscription.data.subscription.unsubscribe(); }
  });
  it('emits a recovered same-account token without repeating sign-in after a network failure', async () => {
    const { firebaseAuth } = await import('./authService');
    const ready = vi.fn(); window.addEventListener('vybe-auth-token-ready', ready);
    const callback = vi.fn(); const subscription = firebaseAuth.onAuthStateChange(callback);
    await Promise.resolve(); await Promise.resolve();
    const alice = user(); alice.getIdToken.mockRejectedValueOnce(Object.assign(new Error('Network unavailable'), { code: 'auth/network-request-failed' }));
    mock.auth.currentUser = alice; mock.authObserver?.(alice); mock.tokens.forEach(notify => notify(alice));
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith('INITIAL_SESSION', expect.objectContaining({ user: expect.objectContaining({ id: alice.uid }) })));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
    callback.mockClear(); alice.getIdToken.mockResolvedValue('recovered-token');
    mock.tokens.forEach(notify => notify(alice));
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith('TOKEN_REFRESHED', expect.objectContaining({ access_token: 'recovered-token' })));
    expect(callback).not.toHaveBeenCalledWith('SIGNED_IN', expect.anything());
    expect(ready).toHaveBeenCalledOnce();
    expect(ready.mock.calls[0][0]).not.toHaveProperty('detail');
    window.removeEventListener('vybe-auth-token-ready', ready);
    subscription.data.subscription.unsubscribe();
  });
  it('does not emit an old token after A to B to A, even with the same SDK user object', async () => {
    const { firebaseAuth } = await import('./authService');
    const callback = vi.fn(); const subscription = firebaseAuth.onAuthStateChange(callback);
    await Promise.resolve(); await Promise.resolve();
    let release!: (value: string) => void; const delayed = new Promise<string>(resolve => { release = resolve; });
    const alice = user(); alice.getIdToken.mockReturnValueOnce(delayed).mockResolvedValue('current-token');
    mock.listener(alice); mock.listener({ ...user(), uid: 'bob' }); mock.listener(alice);
    release('retired-token'); await vi.waitFor(() => expect(callback).toHaveBeenCalledWith('TOKEN_REFRESHED', expect.objectContaining({ access_token: 'current-token' })));
    expect(callback).not.toHaveBeenCalledWith('TOKEN_REFRESHED', expect.objectContaining({ access_token: 'retired-token' }));
    subscription.data.subscription.unsubscribe();
  });
  it('unsubscription retires deferred token enrichment', async () => {
    const { firebaseAuth } = await import('./authService');
    const ready = vi.fn(); window.addEventListener('vybe-auth-token-ready', ready);
    const callback = vi.fn(); const subscription = firebaseAuth.onAuthStateChange(callback);
    await Promise.resolve(); await Promise.resolve();
    let release!: (value: string) => void; const delayed = new Promise<string>(resolve => { release = resolve; });
    const alice = user(); alice.getIdToken.mockReturnValue(delayed); mock.listener(alice);
    subscription.data.subscription.unsubscribe(); release('late-token'); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(callback.mock.calls.filter(([event]) => event === 'TOKEN_REFRESHED')).toEqual([]);
    expect(ready).not.toHaveBeenCalled(); window.removeEventListener('vybe-auth-token-ready', ready);
  });
  it('a localStorage write failure does not prevent the independent native credential backup', async () => {
    mock.local = false;
    const { firebaseAuth } = await import('./authService'); const mirror = await import('@/lib/authSessionMirror');
    await firebaseAuth.getSession();
    let saved: string | null = null;
    mirror.setAuthVaultTransportForTests({ read: async () => saved, write: (_key, value) => { saved = value; } });
    const subscription = firebaseAuth.onAuthStateChange(vi.fn()); await Promise.resolve(); await Promise.resolve();
    const failure = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw Error('Storage unavailable'); });
    const signedIn = user(); mock.listener(signedIn); await mirror.flushAuthVault();
    expect(saved).toBe(JSON.stringify(signedIn.toJSON()));
    failure.mockRestore(); mirror.setAuthVaultTransportForTests(null); mirror.resetAuthStoragePrepareForTests(); subscription.data.subscription.unsubscribe();
  });
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
