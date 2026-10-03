import { beforeEach, describe, expect, it, vi } from 'vitest';

const isDespiaRuntime = vi.fn(() => true);
const getRuntimeOs = vi.fn(() => 'ios' as const);

vi.mock('@/lib/despiaBridge', () => ({
  despiaCall: vi.fn(async () => null),
  isDespiaRuntime: () => isDespiaRuntime(),
  getRuntimeOs: () => getRuntimeOs(),
  isNativeAppShell: () => isDespiaRuntime(),
  isIOSAppShell: () => isDespiaRuntime() && getRuntimeOs() === 'ios',
  isAndroidAppShell: () => getRuntimeOs() === 'android',
}));

vi.mock('@/lib/deviceDetection', () => ({
  isEmbeddedAppleWebView: () => false,
}));

describe('nativeOAuth Apple iOS routing', () => {
  beforeEach(() => {
    vi.resetModules();
    isDespiaRuntime.mockReturnValue(true);
    getRuntimeOs.mockReturnValue('ios');
  });

  it('does not use Despia oauth:// for Apple on iOS', async () => {
    const { shouldUseDespiaOAuth } = await import('./nativeOAuth');
    expect(shouldUseDespiaOAuth('apple')).toBe(false);
    expect(shouldUseDespiaOAuth('google')).toBe(true);
  });

  it('still uses Despia oauth:// for Apple on Android', async () => {
    getRuntimeOs.mockReturnValue('android');
    const { shouldUseDespiaOAuth } = await import('./nativeOAuth');
    expect(shouldUseDespiaOAuth('apple')).toBe(true);
    expect(shouldUseDespiaOAuth('google')).toBe(true);
  });
});
