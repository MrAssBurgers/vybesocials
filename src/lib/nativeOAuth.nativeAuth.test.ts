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
  isAndroidAppShell: () => isDespiaRuntime() && getRuntimeOs() === 'android',
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
  }, 15_000);

  it('shouldUseNativeAuth true only when flag + bridge + iOS Despia', async () => {
    isFeatureEnabled.mockImplementation((flag: string) => flag === 'native_ios_auth_v1');
    (window as any).__VYBE_NATIVE_AUTH__ = true;
    const { shouldUseNativeAuth } = await import('./nativeAuth');
    expect(shouldUseNativeAuth('apple')).toBe(true);
    expect(shouldUseNativeAuth('google')).toBe(true);
  }, 15_000);

  it('shouldUseNativeAuth false when bridge missing', async () => {
    isFeatureEnabled.mockImplementation((flag: string) => flag === 'native_ios_auth_v1');
    const { shouldUseNativeAuth } = await import('./nativeAuth');
    expect(shouldUseNativeAuth('google')).toBe(false);
  }, 15_000);

  it('shouldUseNativeAuth false on Android even with flag + bridge', async () => {
    isFeatureEnabled.mockImplementation((flag: string) => flag === 'native_ios_auth_v1');
    getRuntimeOs.mockReturnValue('android');
    (window as any).__VYBE_NATIVE_AUTH__ = true;
    const { shouldUseNativeAuth } = await import('./nativeAuth');
    expect(shouldUseNativeAuth('google')).toBe(false);
  }, 15_000);

  it('shouldUseNativeAuthBridge mirrors shouldUseNativeAuth', async () => {
    isFeatureEnabled.mockImplementation((flag: string) => flag === 'native_ios_auth_v1');
    (window as any).__VYBE_NATIVE_AUTH__ = true;
    const { shouldUseNativeAuthBridge } = await import('./nativeOAuth');
    expect(shouldUseNativeAuthBridge('google')).toBe(true);
    expect(shouldUseNativeAuthBridge('apple')).toBe(true);
  }, 15_000);

  it('routes Apple to the JS native-sheet path on Despia iOS', async () => {
    const { shouldUseDespiaAppleJs, shouldUseDespiaOAuth } = await import('./nativeOAuth');
    expect(shouldUseDespiaAppleJs('apple')).toBe(true);
    expect(shouldUseDespiaOAuth('apple')).toBe(false);
    expect(shouldUseDespiaOAuth('google')).toBe(true);
  }, 15_000);

  it('keeps Apple on oauth:// for Despia Android', async () => {
    getRuntimeOs.mockReturnValue('android');
    const { shouldUseDespiaAppleJs, shouldUseDespiaOAuth } = await import('./nativeOAuth');
    expect(shouldUseDespiaAppleJs('apple')).toBe(false);
    expect(shouldUseDespiaOAuth('apple')).toBe(true);
    expect(shouldUseDespiaOAuth('google')).toBe(true);
  }, 15_000);

  it('does not use Despia-specific Apple routes on the normal web', async () => {
    isDespiaRuntime.mockReturnValue(false);
    getRuntimeOs.mockReturnValue('web');
    const { shouldUseDespiaAppleJs, shouldUseDespiaOAuth } = await import('./nativeOAuth');
    expect(shouldUseDespiaAppleJs('apple')).toBe(false);
    expect(shouldUseDespiaOAuth('apple')).toBe(false);
    expect(shouldUseDespiaOAuth('google')).toBe(false);
  }, 15_000);
});
