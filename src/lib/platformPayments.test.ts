import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPlatform = vi.fn(() => 'web');
const isDespiaRuntime = vi.fn(() => false);
const isNativeAppShell = vi.fn(() => false);

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => getPlatform(),
  },
}));

vi.mock('@/lib/despiaBridge', () => ({
  isDespiaRuntime: () => isDespiaRuntime(),
  isNativeAppShell: () => isNativeAppShell(),
}));

import {
  __resetPaymentOpenLockForTests,
  isApprovedStripeHostedUrl,
  openCheckoutUrl,
  openStripeHostedUrl,
} from './platformPayments';

describe('platform payment routing', () => {
  beforeEach(() => {
    getPlatform.mockReturnValue('web');
    isDespiaRuntime.mockReturnValue(false);
    isNativeAppShell.mockReturnValue(false);
    __resetPaymentOpenLockForTests();
    vi.restoreAllMocks();
  });

  it('accepts HTTPS Stripe hosts and rejects lookalikes or insecure URLs', () => {
    expect(isApprovedStripeHostedUrl('https://connect.stripe.com/setup/test')).toBe(true);
    expect(isApprovedStripeHostedUrl('https://checkout.stripe.com/c/pay/test')).toBe(true);
    expect(isApprovedStripeHostedUrl('http://connect.stripe.com/setup/test')).toBe(false);
    expect(isApprovedStripeHostedUrl('https://stripe.com.evil.example/setup')).toBe(false);
    expect(isApprovedStripeHostedUrl('not-a-url')).toBe(false);
  });

  it('opens hosted Stripe pages through the native shell external-browser surface', () => {
    isNativeAppShell.mockReturnValue(true);
    isDespiaRuntime.mockReturnValue(true);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    expect(openStripeHostedUrl('https://connect.stripe.com/setup/test')).toBe(true);
    expect(open).toHaveBeenCalledWith('https://connect.stripe.com/setup/test', '_blank');
  });

  it('blocks duplicate payment opens from rapid taps', () => {
    isNativeAppShell.mockReturnValue(true);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    expect(openStripeHostedUrl('https://connect.stripe.com/setup/one')).toBe(true);
    expect(openStripeHostedUrl('https://connect.stripe.com/setup/two')).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('rejects non-HTTPS generic checkout URLs', () => {
    expect(openCheckoutUrl('javascript:alert(1)')).toBe(false);
    expect(openCheckoutUrl('http://example.com/checkout')).toBe(false);
  });
});
