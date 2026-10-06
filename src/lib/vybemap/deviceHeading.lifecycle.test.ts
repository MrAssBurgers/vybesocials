import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const platform = vi.hoisted(() => ({ native: false, call: vi.fn() }));
vi.mock('@/lib/despiaBridge', () => ({ despiaCall: platform.call, isDespiaRuntime: () => platform.native, isIOSUA: () => platform.native, getRuntimeOs: () => platform.native ? 'ios' : 'web' }));
const stops: Array<() => void> = [];
const gyroWindow = window as Window & { onGyroscopeChange?: ((data: { heading: number }) => void) | null };
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); platform.native = false;
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.stubGlobal('DeviceOrientationEvent', class extends Event {}); gyroWindow.onGyroscopeChange = null;
});
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.unstubAllGlobals(); gyroWindow.onGyroscopeChange = null; });
const sample = () => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 270, absolute: true }));
it.each(['granted', 'denied'])('a late %s permission reply cannot reattach a departed subscription', async result => {
  let resolve!: (value: string) => void;
  const permission = vi.fn(() => new Promise<string>(done => { resolve = done; }));
  vi.stubGlobal('DeviceOrientationEvent', { requestPermission: permission });
  const { subscribeDeviceHeading } = await import('./deviceHeading'); const listener = vi.fn();
  const stop = subscribeDeviceHeading(listener); stop(); resolve(result);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  sample(); window.dispatchEvent(new Event('pointerdown')); await Promise.resolve();
  expect(listener).not.toHaveBeenCalled(); expect(permission).toHaveBeenCalledOnce();
});
it('a rejected mount request does not poison the next user gesture, and pending requests coalesce', async () => {
  const permission = vi.fn().mockRejectedValueOnce(new DOMException('Gesture required', 'NotAllowedError')).mockResolvedValue('granted');
  vi.stubGlobal('DeviceOrientationEvent', { requestPermission: permission });
  const { ensureDeviceOrientationPermission, subscribeDeviceHeading } = await import('./deviceHeading');
  expect(await ensureDeviceOrientationPermission()).toBe(false);
  const first = ensureDeviceOrientationPermission(), second = ensureDeviceOrientationPermission();
  expect(first).toBe(second); expect(await first).toBe(true); expect(permission).toHaveBeenCalledTimes(2);
  const listener = vi.fn(); stops.push(subscribeDeviceHeading(listener)); await Promise.resolve();
  sample(); expect(listener).toHaveBeenCalledOnce(); expect(permission).toHaveBeenCalledTimes(2);
});
it('web subscriptions stop on native pause even if document visibility stays visible', async () => {
  const { subscribeForegroundDeviceHeading } = await import('./deviceHeading');
  const listener = vi.fn(), paused = vi.fn(); stops.push(subscribeForegroundDeviceHeading(listener, paused));
  await Promise.resolve(); sample(); expect(listener).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event('app-paused')); document.dispatchEvent(new Event('visibilitychange'));
  sample(); expect(listener).toHaveBeenCalledOnce(); expect(paused).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event('app-resumed')); await Promise.resolve(); sample(); expect(listener).toHaveBeenCalledTimes(2);
});
it('a native resume cannot subscribe while the document is hidden', async () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  const { subscribeForegroundDeviceHeading } = await import('./deviceHeading'); const listener = vi.fn();
  stops.push(subscribeForegroundDeviceHeading(listener, vi.fn()));
  window.dispatchEvent(new Event('app-resumed')); await Promise.resolve(); sample(); expect(listener).not.toHaveBeenCalled();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); sample(); expect(listener).toHaveBeenCalledOnce();
});
it('the shared iOS gyro stops when hidden and rejects retired callbacks after resuming', async () => {
  platform.native = true;
  const { subscribeForegroundDeviceHeading } = await import('./deviceHeading'); const a = vi.fn(), b = vi.fn();
  stops.push(subscribeForegroundDeviceHeading(a, vi.fn()), subscribeForegroundDeviceHeading(b, vi.fn()));
  const old = gyroWindow.onGyroscopeChange!; old({ heading: 90 }); expect(a).toHaveBeenCalledOnce(); expect(b).toHaveBeenCalledOnce();
  expect(platform.call.mock.calls.filter(([command]) => command.startsWith('gyroscope://start'))).toHaveLength(1);
  window.dispatchEvent(new Event('app-paused')); expect(platform.call).toHaveBeenCalledWith('gyroscope://stop');
  window.dispatchEvent(new Event('app-resumed')); a.mockClear(); b.mockClear(); old({ heading: 180 });
  expect(a).not.toHaveBeenCalled(); expect(b).not.toHaveBeenCalled();
  gyroWindow.onGyroscopeChange!({ heading: 45 }); expect(a).toHaveBeenCalledOnce(); expect(b).toHaveBeenCalledOnce();
  stops.splice(0).forEach(stop => stop()); expect(platform.call.mock.calls.filter(([command]) => command === 'gyroscope://stop')).toHaveLength(2);
});
it('missing orientation support does not crash permission checking', async () => {
  vi.stubGlobal('DeviceOrientationEvent', undefined);
  const { ensureDeviceOrientationPermission } = await import('./deviceHeading'); expect(await ensureDeviceOrientationPermission()).toBe(false);
});
