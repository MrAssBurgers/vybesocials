import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ preview: false }));
vi.mock('./firebase/localPreview', () => ({ isLocalPreview: () => state.preview }));
vi.mock('./legacyAuthStorage', () => ({ clearObsoleteAuthStorage: vi.fn(), repairLegacyAuthStorage: vi.fn() }));
vi.mock('./authSessionMirror', () => ({ ensureAuthStorageReady: vi.fn() }));
vi.mock('./firebase/config', () => ({ isFirebaseConfigured: () => true, getFirebaseConfig: () => ({ apiKey: 'normal-key' }) }));
vi.mock('./passwordRecoveryUrl', () => ({ isPasswordRecoveryUrl: () => false, redirectToPasswordRecoveryPage: vi.fn() }));
vi.mock('./firebase/oauthRedirect', () => ({ clearStaleOAuthRedirectPending: vi.fn() }));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
describe('auth storage bootstrap isolation', () => {
  it('does not run normal login migrations or seed a mirror in the demo preview', async () => {
    state.preview = true;
    await import('./bootstrapAuthStorage');
    const legacy = await import('./legacyAuthStorage');
    expect(legacy.clearObsoleteAuthStorage).not.toHaveBeenCalled();
    expect(legacy.repairLegacyAuthStorage).not.toHaveBeenCalled();
    expect((await import('./authSessionMirror')).ensureAuthStorageReady).not.toHaveBeenCalled();
    expect((await import('./firebase/oauthRedirect')).clearStaleOAuthRedirectPending).not.toHaveBeenCalled();
  });
  it('preserves normal login migration and preparation', async () => {
    state.preview = false;
    await import('./bootstrapAuthStorage');
    const legacy = await import('./legacyAuthStorage');
    expect(legacy.clearObsoleteAuthStorage).toHaveBeenCalledOnce();
    expect(legacy.repairLegacyAuthStorage).toHaveBeenCalledOnce();
    expect((await import('./authSessionMirror')).ensureAuthStorageReady).toHaveBeenCalledWith('normal-key', navigator.userAgent);
    expect((await import('./firebase/oauthRedirect')).clearStaleOAuthRedirectPending).toHaveBeenCalledOnce();
  });
});
