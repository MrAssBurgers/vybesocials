import { afterEach, describe, expect, it, vi } from 'vitest';

describe('getFirebaseConfig storage bucket', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses the live firebasestorage.app bucket when the env bucket is omitted', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-web-key');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'vybe-daaab');
    vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', '');
    vi.stubEnv('VITE_FIREBASE_EMULATORS', '');
    const { getFirebaseConfig } = await import('./config');
    expect(getFirebaseConfig().storageBucket).toBe('vybe-daaab.firebasestorage.app');
    expect(getFirebaseConfig().projectId).toBe('vybe-daaab');
    expect(getFirebaseConfig().authDomain).toBe('vybe-daaab.firebaseapp.com');
  });

  it('keeps an explicit storage bucket', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-web-key');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'vybe-daaab');
    vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET', 'vybe-daaab.firebasestorage.app');
    vi.stubEnv('VITE_FIREBASE_EMULATORS', '');
    const { getFirebaseConfig } = await import('./config');
    expect(getFirebaseConfig().storageBucket).toBe('vybe-daaab.firebasestorage.app');
  });
});
