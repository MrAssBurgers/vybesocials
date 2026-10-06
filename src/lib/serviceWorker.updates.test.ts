import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/despiaBridge', () => ({ isDespiaRuntime: () => false }));
vi.mock('@/lib/appUpdateBridge', () => ({ signalAppUpdate: vi.fn(), APP_UPDATE_RELOAD_DELAY_MS: 200 }));

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('returning session worker updates', () => {
  it.each([true, false])('continues hourly checks for existing registration=%s without duplicate timers', async existing => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { location: new URL('https://vybehub.app'), setTimeout });
    const registration = {
      scope: 'https://vybehub.app/',
      active: { scriptURL: 'https://vybehub.app/sw.js' },
      waiting: null,
      update: vi.fn(async () => {}),
      addEventListener: vi.fn(),
    };
    const register = vi.fn(async () => registration);
    vi.stubGlobal('navigator', {
      onLine: false,
      serviceWorker: {
        controller: null,
        getRegistrations: vi.fn(async () => existing ? [registration] : []),
        getRegistration: vi.fn(async () => existing ? registration : undefined),
        register,
        addEventListener: vi.fn(),
      },
    });
    const { registerVybeServiceWorker } = await import('./serviceWorker');
    expect(await registerVybeServiceWorker()).toBe(registration);
    expect(await registerVybeServiceWorker()).toBe(registration);
    expect(register).toHaveBeenCalledTimes(existing ? 0 : 1);
    expect(registration.update).toHaveBeenCalledTimes(existing ? 1 : 0);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(registration.update).toHaveBeenCalledTimes(existing ? 2 : 1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(registration.update).toHaveBeenCalledTimes(existing ? 3 : 2);
  });
});
