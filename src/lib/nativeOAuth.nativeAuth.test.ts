import { beforeEach, describe, expect, it, vi } from 'vitest';

const isFeatureEnabled = vi.fn((_flag: string) => false);
const isDespiaRuntime = vi.fn(() => true);
const getRuntimeOs = vi.fn(() => 'ios' as const);

vi.mock('@/lib/featureFlags', () => ({
  isFeatureEnabled: (flag: string) => isFeatureEnabled(flag),
}));

vi.mock('@/lib/despiaBridge', () => ({
  despiaCall: vi.fn(async () => null),
  isDespiaRuntime: () => isDespiaRuntime(),
  getRuntimeOs: () => getRuntimeOs(),
  isNativeAppShell: () => isDespiaRuntime(),
  isIOSAppShell: () => isDespiaRuntime() && getRuntimeOs() === 'ios',
  isAndroidAppShell: () => false,
}));

describe('nativeAuth feature-flag routing', () => {
  beforeEach(() => {
    vi.resetModules();
    isFeatureEnabled.mockReturnValue(false);
    isDespiaRuntime.mockReturnValue(true);
    getRuntimeOs.mockReturnValue('ios');
    delete (window as any).__VYBE_NATIVE_AUTH__;
    delete (window as any).__VYBE_NATIVE_AUTH_READY__;
    delete (window as any).nativeAuthBridge;
  });

  it('shouldUseNativeAuth is false by default (flag off)', async () => {
    (window as any).__VYBE_NATIVE_AUTH__ = true;
    const { shouldUseNativeAuth, isNativeAuthEnabled } = await import('./nativeAuth');
    expect(isNativeAuthEnabled()).toBe(false);
    expect(shouldUseNativeAuth('google')).toBe(false);
  });

  it('shouldUseNativeAuth true only when flag + bridge + iOS Despia', async () => {
    isFeatureEnabled.mockImplementation((flag: string) => flag === 'native_ios_auth_v1');
    (window as any).__VYBE_NATIVE_AUTH__ = true;
    const { shouldUseNativeAuth } = await import('./nativeAuth');
    expect(shouldUseNativeAuth('apple')).toBe(true);
    expect(shouldUseNativeAuth('google')).toBe(true);
  });

  it('shouldUseNativeAuth false when bridge missing', async () => {
    isFeatureEnabled.mockImplementation((flag: string) => flag === 'native_ios_auth_v1');
    const { shouldUseNativeAuth } = await import('./nativeAuth');
    expect(shouldUseNativeAuth('google')).toBe(false);
  });

  it('shouldUseNativeAuth false on Android even with flag + bridge', async () => {
    isFeatureEnabled.mockImplementation((flag: string) => flag === 'native_ios_auth_v1');
    getRuntimeOs.mockReturnValue('android');
    (window as any).__VYBE_NATIVE_AUTH__ = true;
    const { shouldUseNativeAuth } = await import('./nativeAuth');
    expect(shouldUseNativeAuth('google')).toBe(false);
  });

  it('shouldUseNativeAuthBridge mirrors shouldUseNativeAuth', async () => {
    isFeatureEnabled.mockImplementation((flag: string) => flag === 'native_ios_auth_v1');
    (window as any).__VYBE_NATIVE_AUTH__ = true;
    const { shouldUseNativeAuthBridge } = await import('./nativeOAuth');
    expect(shouldUseNativeAuthBridge('google')).toBe(true);
    expect(shouldUseNativeAuthBridge('apple')).toBe(true);
  });
});
