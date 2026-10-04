import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from 'firebase/auth';
import type { FirebaseApp } from 'firebase/app';
const mock = vi.hoisted(() => ({ enabled: true, firestore: {}, functions: {}, storage: {}, initialize: vi.fn(), firestoreConnect: vi.fn(), functionsConnect: vi.fn(), storageConnect: vi.fn(), authConnect: vi.fn() }));
vi.mock('./localPreview', () => ({ isLocalPreview: () => mock.enabled, LOCAL_PREVIEW_PROJECT: 'demo-vybe-preview', LOCAL_PREVIEW_PORTS: { auth: 9199, firestore: 8280, storage: 9399, functions: 5101 } }));
vi.mock('firebase/firestore', () => ({ initializeFirestore: (...args: unknown[]) => { mock.initialize(...args); return mock.firestore; }, connectFirestoreEmulator: (...args: unknown[]) => mock.firestoreConnect(...args) }));
vi.mock('firebase/functions', () => ({ getFunctions: () => mock.functions, connectFunctionsEmulator: (...args: unknown[]) => mock.functionsConnect(...args) }));
vi.mock('firebase/storage', () => ({ getStorage: () => mock.storage, connectStorageEmulator: (...args: unknown[]) => mock.storageConnect(...args) }));
vi.mock('firebase/auth', () => ({ connectAuthEmulator: (auth: Auth, ...args: unknown[]) => {
  mock.authConnect(auth, ...args);
  Object.assign(auth, { emulatorConfig: { host: '127.0.0.1', port: 9199 } });
} }));
import { connectLocalPreview, connectLocalPreviewAuth } from './emulators';
const app = (projectId = 'demo-vybe-preview') => ({ options: { projectId } }) as FirebaseApp;
beforeEach(() => { vi.clearAllMocks(); mock.enabled = true; vi.stubGlobal('location', { hostname: '127.0.0.1', port: '8082', origin: 'http://127.0.0.1:8082' }); });
afterEach(() => vi.unstubAllGlobals());
describe('local Firebase service wiring', () => {
  it('connects all data services once before direct SDK consumers can use the app', () => {
    const instance = app(); connectLocalPreview(instance, 'us-central1'); connectLocalPreview(instance, 'us-central1');
    expect(mock.initialize).toHaveBeenCalledTimes(1);
    expect(mock.firestoreConnect).toHaveBeenCalledWith(mock.firestore, '127.0.0.1', 8280);
    expect(mock.functionsConnect).toHaveBeenCalledWith(mock.functions, '127.0.0.1', 8082);
    expect(mock.storageConnect).toHaveBeenCalledWith(mock.storage, '127.0.0.1', 8082);
  });
  it('never reconfigures production SDK instances', () => {
    mock.enabled = false; connectLocalPreview(app('real-project'), 'us-central1'); connectLocalPreviewAuth({ app: app('real-project') } as Auth);
    expect(mock.initialize).not.toHaveBeenCalled(); expect(mock.authConnect).not.toHaveBeenCalled();
  });
  it('rejects a real project reused by HMR before connecting anything', () => {
    expect(() => connectLocalPreview(app('real-project'), 'us-central1')).toThrow('real Firebase project');
    expect(mock.initialize).not.toHaveBeenCalled();
  });
  it('rejects any other Functions region before configuring services', () => {
    expect(() => connectLocalPreview(app(), 'europe-west1')).toThrow('fixed us-central1');
    expect(mock.initialize).not.toHaveBeenCalled(); expect(mock.functionsConnect).not.toHaveBeenCalled();
  });
  it('keeps browser Functions on the same accepted loopback hostname', () => {
    vi.stubGlobal('location', { hostname: 'localhost', port: '8082', origin: 'http://localhost:8082' });
    connectLocalPreview(app(), 'us-central1');
    expect(mock.functionsConnect).toHaveBeenCalledWith(mock.functions, 'localhost', 8082);
    expect(mock.storageConnect).toHaveBeenCalledWith(mock.storage, 'localhost', 8082);
  });
  it('connects authentication once and checks its endpoint on reuse', () => {
    const auth = { app: app() } as Auth; connectLocalPreviewAuth(auth); connectLocalPreviewAuth(auth);
    expect(mock.authConnect).toHaveBeenCalledTimes(1);
    expect(mock.authConnect).toHaveBeenCalledWith(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  });
  it('rejects an Auth instance from a real project', () => {
    expect(() => connectLocalPreviewAuth({ app: app('real-project') } as Auth)).toThrow('real account');
    expect(mock.authConnect).not.toHaveBeenCalled();
  });
  it('rejects a mismatched existing emulator instead of reusing its accounts', () => {
    expect(() => connectLocalPreviewAuth({ app: app(), emulatorConfig: { host: '127.0.0.1', port: 9099 } } as Auth)).toThrow('endpoint mismatch');
    expect(mock.authConnect).not.toHaveBeenCalled();
  });
});
