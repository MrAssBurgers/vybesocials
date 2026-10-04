import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ preview: true, loaded: 0, app: {}, messaging: {}, supported: vi.fn(), getMessaging: vi.fn(), getToken: vi.fn(), onMessage: vi.fn() }));
vi.mock('./localPreview', () => ({ isLocalPreview: () => mocks.preview }));
vi.mock('./app', () => ({ getFirebaseApp: () => mocks.app }));
vi.mock('firebase/messaging', () => {
  mocks.loaded++;
  return { isSupported: mocks.supported, getMessaging: mocks.getMessaging, getToken: mocks.getToken, onMessage: mocks.onMessage };
});
let service: typeof import('./messagingService');
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); mocks.preview = true; mocks.loaded = 0;
  mocks.supported.mockResolvedValue(true); mocks.getMessaging.mockReturnValue(mocks.messaging); mocks.getToken.mockResolvedValue('demo-token');
  service = await import('./messagingService');
});
describe('local preview excludes FCM provider registration', () => {
  it('does not evaluate messaging SDK just by importing the service', () => {
    expect(mocks.loaded).toBe(0); expect(mocks.getMessaging).not.toHaveBeenCalled();
  });
  it('keeps every QA entry point from importing or initializing the push SDK', async () => {
    await expect(service.getFirebaseMessaging()).resolves.toBeNull();
    await expect(service.requestFcmToken('unused')).resolves.toBeNull();
    await expect(service.onForegroundMessage(vi.fn())).resolves.toBeNull();
    expect(mocks.loaded).toBe(0); expect(mocks.supported).not.toHaveBeenCalled(); expect(mocks.getToken).not.toHaveBeenCalled();
  });
  it('checks actual SDK support before production messaging initialization', async () => {
    mocks.preview = false; mocks.supported.mockResolvedValueOnce(false);
    await expect(service.getFirebaseMessaging()).resolves.toBeNull();
    expect(mocks.loaded).toBe(1); expect(mocks.supported).toHaveBeenCalledOnce(); expect(mocks.getMessaging).not.toHaveBeenCalled();
  });
  it('preserves the supported production SDK token and listener paths', async () => {
    mocks.preview = false; const handler = vi.fn(), unsubscribe = vi.fn(); mocks.onMessage.mockReturnValue(unsubscribe);
    await expect(service.requestFcmToken('configured-vapid')).resolves.toBe('demo-token');
    expect(mocks.getToken).toHaveBeenCalledWith(mocks.messaging, { vapidKey: 'configured-vapid' });
    await expect(service.onForegroundMessage(handler)).resolves.toBe(unsubscribe);
    expect(mocks.onMessage).toHaveBeenCalledWith(mocks.messaging, handler); expect(mocks.getMessaging).toHaveBeenCalledOnce();
  });
  it('preserves the null result when a production token request fails', async () => {
    mocks.preview = false; mocks.getToken.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(service.requestFcmToken('configured-vapid')).resolves.toBeNull();
  });
});
