import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const despiaCall = vi.fn(async () => null);
const isDespiaRuntime = vi.fn(() => true);
const getRuntimeOs = vi.fn(() => 'ios' as const);

vi.mock('@/lib/despiaBridge', () => ({
  despiaCall: (...args: unknown[]) => despiaCall(...args),
  isDespiaRuntime: () => isDespiaRuntime(),
  getRuntimeOs: () => getRuntimeOs(),
}));

describe('nativeAuth platform + bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    despiaCall.mockReset();
    despiaCall.mockResolvedValue(null);
    isDespiaRuntime.mockReturnValue(true);
    getRuntimeOs.mockReturnValue('ios');
    delete (window as any).__VYBE_NATIVE_AUTH__;
    delete (window as any).__VYBE_NATIVE_AUTH_READY__;
    delete (window as any).nativeAuthBridge;
    delete (window as any).nativeAuthResult;
    if ((window as any).webkit?.messageHandlers) {
      delete (window as any).webkit.messageHandlers.nativeAuth;
    }
  });

  afterEach(async () => {
    const { __resetNativeAuthBridgeForTests } = await import('./bridge');
    __resetNativeAuthBridgeForTests();
  });

  it('isNativeAuthPlatformEligible only on iOS Despia', async () => {
    const { isNativeAuthPlatformEligible } = await import('./platform');
    expect(isNativeAuthPlatformEligible()).toBe(true);

    getRuntimeOs.mockReturnValue('android');
    vi.resetModules();
    const android = await import('./platform');
    expect(android.isNativeAuthPlatformEligible()).toBe(false);

    getRuntimeOs.mockReturnValue('ios');
    isDespiaRuntime.mockReturnValue(false);
    vi.resetModules();
    const noDespia = await import('./platform');
    expect(noDespia.isNativeAuthPlatformEligible()).toBe(false);
  });

  it('isBridgeAvailable defaults false until Despia advertises', async () => {
    const { isBridgeAvailable } = await import('./bridge');
    expect(isBridgeAvailable()).toBe(false);

    (window as any).__VYBE_NATIVE_AUTH__ = true;
    expect(isBridgeAvailable()).toBe(true);

    delete (window as any).__VYBE_NATIVE_AUTH__;
    (window as any).nativeAuthBridge = {};
    expect(isBridgeAvailable()).toBe(true);
  });

  it('isBridgeAvailable false outside Despia even with flag object', async () => {
    isDespiaRuntime.mockReturnValue(false);
    (window as any).__VYBE_NATIVE_AUTH__ = true;
    const { isBridgeAvailable } = await import('./bridge');
    expect(isBridgeAvailable()).toBe(false);
  });

  it('requestNativeAuth mutex rejects concurrent calls', async () => {
    (window as any).__VYBE_NATIVE_AUTH__ = true;
    despiaCall.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 80));
      return null;
    });
    const { requestNativeAuth, __resetNativeAuthBridgeForTests } = await import('./bridge');
    __resetNativeAuthBridgeForTests();

    const first = requestNativeAuth('google', { timeoutMs: 200 });
    const second = await requestNativeAuth('google', { timeoutMs: 200 });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.code).toBe('bridge_error');
      expect(second.message).toMatch(/already in progress/i);
    }
    // Let first settle (timeout)
    await first;
  });

  it('requestNativeAuth times out when no matching reply', async () => {
    (window as any).__VYBE_NATIVE_AUTH__ = true;
    const { requestNativeAuth, __resetNativeAuthBridgeForTests } = await import('./bridge');
    __resetNativeAuthBridgeForTests();
    const result = await requestNativeAuth('apple', { nonceHash: 'abc', timeoutMs: 120 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('bridge_error');
  });

  it('requestNativeAuth ignores wrong-provider replies until timeout', async () => {
    (window as any).__VYBE_NATIVE_AUTH__ = true;
    despiaCall.mockImplementation(async () => {
      (window as any).nativeAuthResult = {
        ok: true,
        provider: 'google',
        requestId: 'other',
        idToken: 'tok',
      };
      return null;
    });
    const { requestNativeAuth, __resetNativeAuthBridgeForTests } = await import('./bridge');
    __resetNativeAuthBridgeForTests();
    const result = await requestNativeAuth('apple', { nonceHash: 'h', timeoutMs: 150 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('bridge_error');
  });

  it('requestNativeAuth accepts matching success', async () => {
    (window as any).__VYBE_NATIVE_AUTH__ = true;
    let capturedUrl = '';
    despiaCall.mockImplementation(async (url: string) => {
      capturedUrl = url;
      const id = new URL(url.replace('nativeauth://', 'https://nativeauth/')).searchParams.get(
        'requestId',
      );
      (window as any).nativeAuthResult = {
        ok: true,
        provider: 'google',
        requestId: id,
        idToken: 'google-id-token',
        accessToken: 'access',
      };
      return null;
    });
    const { requestNativeAuth, __resetNativeAuthBridgeForTests } = await import('./bridge');
    __resetNativeAuthBridgeForTests();
    const result = await requestNativeAuth('google', { timeoutMs: 2000 });
    expect(capturedUrl.startsWith('nativeauth://google?')).toBe(true);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.idToken).toBe('google-id-token');
      expect(result.provider).toBe('google');
    }
  });
});
