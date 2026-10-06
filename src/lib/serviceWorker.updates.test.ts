import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const foreground = vi.hoisted(() => ({ active: true, listeners: new Set<() => void>() }));
vi.mock('@/lib/foregroundReadPhase', () => ({ isAppForeground: () => foreground.active,
  subscribeForegroundReadPhase: (callback: () => void) => { foreground.listeners.add(callback); return () => foreground.listeners.delete(callback); } }));
beforeEach(() => { foreground.active = true; foreground.listeners.clear(); });

vi.mock('@/lib/despiaBridge', () => ({ isDespiaRuntime: () => false }));
vi.mock('@/lib/appUpdateBridge', () => ({ signalAppUpdate: vi.fn(), APP_UPDATE_RELOAD_DELAY_MS: 200, hasActiveAppDraft: vi.fn(() => false) }));

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

it.each(['existing', 'late', 'read-blocked', 'write-blocked', 'normal'] as const)('controller refresh protects %s state', async mode => {
  vi.useFakeTimers();
  const { hasActiveAppDraft, signalAppUpdate } = await import('./appUpdateBridge');
  vi.mocked(hasActiveAppDraft).mockReturnValue(mode === 'existing');
  const replace = vi.fn();
  vi.stubGlobal('window', { location: { hostname: 'vybehub.app', origin: 'https://vybehub.app', replace }, setTimeout });
  const storage = {
    getItem: vi.fn(() => { if (mode === 'read-blocked') throw new Error('blocked'); return null; }),
    setItem: vi.fn(() => { if (mode === 'write-blocked') throw new Error('blocked'); }),
  };
  vi.stubGlobal('sessionStorage', storage);
  const handlers = new Map<string, () => void>();
  const registration = { active: { scriptURL: 'https://vybehub.app/sw.js' }, waiting: null, update: vi.fn(async () => {}), addEventListener: vi.fn(), scope: 'https://vybehub.app/' };
  vi.stubGlobal('navigator', { onLine: false, serviceWorker: { controller: registration.active, getRegistrations: async () => [registration], getRegistration: async () => registration, addEventListener: (type: string, handler: () => void) => handlers.set(type, handler) } });
  const { registerVybeServiceWorker } = await import('./serviceWorker');
  await registerVybeServiceWorker();
  expect(() => handlers.get('controllerchange')!()).not.toThrow();
  if (mode === 'late') vi.mocked(hasActiveAppDraft).mockReturnValue(true);
  await vi.advanceTimersByTimeAsync(200);
  expect(replace).toHaveBeenCalledTimes(mode === 'normal' ? 1 : 0);
  vi.mocked(hasActiveAppDraft).mockReturnValue(false);
  vi.mocked(signalAppUpdate).mockClear();
});

it.each(['draft', 'background', 'late-draft', 'late-background'] as const)('resumes a deferred controller update after %s clears', async mode => {
  vi.useFakeTimers();
  const { hasActiveAppDraft, signalAppUpdate } = await import('./appUpdateBridge');
  vi.mocked(hasActiveAppDraft).mockReturnValue(mode === 'draft');
  foreground.active = mode !== 'background';
  const replace = vi.fn(), handlers = new Map<string, () => void>();
  vi.stubGlobal('window', { location: { hostname: 'vybehub.app', origin: 'https://vybehub.app', replace }, setTimeout });
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: vi.fn() });
  const registration = { active: { scriptURL: 'https://vybehub.app/sw.js' }, waiting: null, update: vi.fn(async () => {}), addEventListener: vi.fn(), scope: 'https://vybehub.app/' };
  vi.stubGlobal('navigator', { onLine: false, serviceWorker: { controller: registration.active, getRegistrations: async () => [registration], getRegistration: async () => registration, addEventListener: (type: string, handler: () => void) => handlers.set(type, handler) } });
  const { registerVybeServiceWorker } = await import('./serviceWorker');
  await registerVybeServiceWorker(); handlers.get('controllerchange')!();
  if (mode === 'late-draft') vi.mocked(hasActiveAppDraft).mockReturnValue(true);
  if (mode === 'late-background') foreground.active = false;
  await vi.advanceTimersByTimeAsync(15_000);
  expect(replace).not.toHaveBeenCalled(); expect(signalAppUpdate).not.toHaveBeenCalled();
  vi.mocked(hasActiveAppDraft).mockReturnValue(false); foreground.active = true;
  foreground.listeners.forEach(callback => callback());
  await vi.advanceTimersByTimeAsync(15_000);
  expect(replace).toHaveBeenCalledOnce(); expect(signalAppUpdate).toHaveBeenCalledOnce();
  handlers.get('controllerchange')!(); await vi.advanceTimersByTimeAsync(30_000);
  expect(replace).toHaveBeenCalledOnce(); vi.mocked(signalAppUpdate).mockClear();
});

it.each(['draft', 'background'] as const)('promotes a waiting worker once after %s clears', async mode => {
  vi.useFakeTimers();
  const { hasActiveAppDraft } = await import('./appUpdateBridge');
  vi.mocked(hasActiveAppDraft).mockReturnValue(mode === 'draft'); foreground.active = mode !== 'background';
  const postMessage = vi.fn();
  vi.stubGlobal('window', { location: new URL('https://vybehub.app'), setTimeout });
  const registration = { active: { scriptURL: 'https://vybehub.app/sw.js' }, waiting: { postMessage }, update: vi.fn(async () => {}), addEventListener: vi.fn(), scope: 'https://vybehub.app/' };
  vi.stubGlobal('navigator', { onLine: false, serviceWorker: { controller: registration.active, getRegistrations: async () => [registration], getRegistration: async () => registration, addEventListener: vi.fn() } });
  const { registerVybeServiceWorker } = await import('./serviceWorker'); await registerVybeServiceWorker();
  await vi.advanceTimersByTimeAsync(30_000); expect(postMessage).not.toHaveBeenCalled();
  vi.mocked(hasActiveAppDraft).mockReturnValue(false); foreground.active = true;
  await vi.advanceTimersByTimeAsync(15_000); expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'SKIP_WAITING' });
  foreground.listeners.forEach(callback => callback()); await vi.advanceTimersByTimeAsync(30_000);
  expect(postMessage).toHaveBeenCalledOnce();
});
