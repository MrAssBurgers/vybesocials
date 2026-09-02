import { beforeEach, describe, expect, it, vi } from 'vitest';

const despiaCall = vi.fn(async () => null);
const isDespiaRuntime = vi.fn(() => false);
const getRuntimeOs = vi.fn(() => 'web' as const);

vi.mock('@/lib/despiaBridge', () => ({
  despiaCall: (...args: unknown[]) => despiaCall(...args),
  isDespiaRuntime: () => isDespiaRuntime(),
  getRuntimeOs: () => getRuntimeOs(),
  isNativeAppShell: () => isDespiaRuntime(),
}));

describe('openStripeConnectFlow', () => {
  beforeEach(() => {
    vi.resetModules();
    despiaCall.mockClear();
    isDespiaRuntime.mockReturnValue(false);
    getRuntimeOs.mockReturnValue('web');
  });

  it('rejects non-Stripe URLs', async () => {
    const { isApprovedStripeConnectUrl, openStripeConnectFlow } = await import('./openStripeConnectFlow');
    expect(isApprovedStripeConnectUrl('https://evil.example/phish')).toBe(false);
    expect(await openStripeConnectFlow('https://evil.example/phish')).toBe(false);
  });

  it('opens approved Stripe URLs on web', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const { openStripeConnectFlow } = await import('./openStripeConnectFlow');
    const ok = await openStripeConnectFlow('https://connect.stripe.com/setup/s/acct_123');
    expect(ok).toBe(true);
    expect(openSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('uses oauth:// bridge on Despia iOS', async () => {
    isDespiaRuntime.mockReturnValue(true);
    getRuntimeOs.mockReturnValue('ios');
    const { openStripeConnectFlow } = await import('./openStripeConnectFlow');
    const ok = await openStripeConnectFlow('https://connect.stripe.com/setup/s/acct_123');
    expect(ok).toBe(true);
    expect(despiaCall).toHaveBeenCalledWith(
      expect.stringMatching(/^oauth:\/\/\?url=/),
    );
  });

  it('enforces single-flight lock', async () => {
    isDespiaRuntime.mockReturnValue(true);
    getRuntimeOs.mockReturnValue('ios');
    const { openStripeConnectFlow } = await import('./openStripeConnectFlow');
    const first = openStripeConnectFlow('https://connect.stripe.com/setup/s/acct_123');
    const second = await openStripeConnectFlow('https://connect.stripe.com/setup/s/acct_456');
    expect(second).toBe(false);
    await first;
  });
});
