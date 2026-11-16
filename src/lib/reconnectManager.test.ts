import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
const runtime = vi.hoisted(() => ({ native: false }));
vi.mock('./despiaBridge', () => ({ isNativeAppShell: () => runtime.native }));
let manager: typeof import('./reconnectManager');
let stop: (() => void) | undefined;
const fetcher = vi.fn(), offline = vi.fn(), online = vi.fn();
let windowAdds: ReturnType<typeof vi.spyOn>, documentAdds: ReturnType<typeof vi.spyOn>;
const ok = () => ({ ok: true, status: 200, type: 'basic' });
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const query = () => ({ refetchQueries: vi.fn().mockResolvedValue(undefined), resumePausedMutations: vi.fn().mockResolvedValue(undefined) });
async function start(client = query()) {
  manager = await import('./reconnectManager');
  const value = manager.startReconnectManager(client as unknown as QueryClient);
  stop = typeof value === 'function' ? value : undefined;
  return client;
}
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); runtime.native = false; fetcher.mockReset(); offline.mockClear(); online.mockClear();
  fetcher.mockResolvedValue(ok()); vi.stubGlobal('fetch', fetcher);
  windowAdds = vi.spyOn(window, 'addEventListener'); documentAdds = vi.spyOn(document, 'addEventListener');
  window.addEventListener('vybe:offline', offline); window.addEventListener('vybe:online', online);
});
afterEach(() => {
  stop?.(); stop = undefined;
  for (const [type, listener] of windowAdds.mock.calls) window.removeEventListener(type as string, listener as EventListener);
  for (const [type, listener] of documentAdds.mock.calls) document.removeEventListener(type as string, listener as EventListener);
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
it('coalesces startup/focus/pageshow checks and refetches stale active queries once per confirmed recovery', async () => {
  let fail!: (reason: unknown) => void;
  fetcher.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
  const client = await start(); const listener = vi.fn(); manager.onReconnect(listener);
  window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('pageshow')); window.dispatchEvent(new Event('online'));
  expect(fetcher).toHaveBeenCalledOnce();
  fail(Error('synthetic network failure')); await settle(); expect(offline).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event('focus')); await settle();
  expect(online).toHaveBeenCalledOnce(); expect(listener).toHaveBeenCalledOnce();
  expect(client.refetchQueries).toHaveBeenCalledExactlyOnceWith({ type: 'active', stale: true });
  expect(client.resumePausedMutations).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event('pageshow')); await settle(); expect(listener).toHaveBeenCalledOnce();
});
it('retires a pre-pause request so its late failure cannot override a fresh native resume', async () => {
  let fail!: (reason: unknown) => void;
  fetcher.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
  await start(); const original = fetcher.mock.calls[0][1].signal as AbortSignal;
  window.dispatchEvent(new Event('app-paused')); expect(original.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  window.dispatchEvent(new Event('app-resumed')); await settle(); expect(fetcher).toHaveBeenCalledTimes(2);
  fail(Error('late old request')); await settle();
  expect(offline).not.toHaveBeenCalled(); expect(online).not.toHaveBeenCalled();
});
it('bounds an unresponsive fetch even when it ignores abort and continues the offline retry loop', async () => {
  fetcher.mockReturnValueOnce(new Promise(() => {})); await start();
  const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
  await vi.advanceTimersByTimeAsync(2500); expect(signal.aborted).toBe(true); expect(offline).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1500); expect(fetcher).toHaveBeenCalledTimes(2); expect(online).toHaveBeenCalledOnce();
});
it('clears failed-request deadlines and returns an owned stop handle that allows a clean restart', async () => {
  fetcher.mockRejectedValueOnce(Error('synthetic failure')); await start(); await settle();
  expect(vi.getTimerCount()).toBe(1); expect(stop).toBeTypeOf('function');
  stop!(); expect(vi.getTimerCount()).toBe(0);
  window.dispatchEvent(new Event('focus')); expect(fetcher).toHaveBeenCalledOnce();
  await start(); await settle(); expect(fetcher).toHaveBeenCalledTimes(2); expect(online).toHaveBeenCalledOnce();
});
it('does no probe or heartbeat work while hidden and refreshes immediately on visibility return', async () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await start(); await vi.advanceTimersByTimeAsync(120000); expect(fetcher).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange')); await settle();
  expect(fetcher).toHaveBeenCalledOnce();
});
it('uses a root-relative web probe without credentials or cache, including on nested routes', async () => {
  await start(); await settle();
  expect(String(fetcher.mock.calls[0][0])).toMatch(/^\/favicon\.ico\?_probe=/);
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'HEAD', cache: 'no-store', credentials: 'omit', mode: 'same-origin' });
});
it('probes the public origin in native shells and accepts a successful opaque network response', async () => {
  runtime.native = true; fetcher.mockRejectedValueOnce(Error('offline'));
  await start(); await settle();
  expect(String(fetcher.mock.calls[0][0])).toMatch(/^https:\/\/vybehub\.app\/favicon\.ico\?_probe=/);
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', mode: 'no-cors' });
  fetcher.mockResolvedValueOnce({ ok: false, status: 0, type: 'opaque' });
  window.dispatchEvent(new Event('focus')); await settle(); expect(online).toHaveBeenCalledOnce();
});
it('stopping an owned in-flight probe prevents all late state changes and future heartbeat work', async () => {
  let finish!: (value: unknown) => void;
  fetcher.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await start(); expect(stop).toBeTypeOf('function'); stop!();
  finish({ ok: false, status: 503 }); await settle(); await vi.advanceTimersByTimeAsync(120000);
  expect(fetcher).toHaveBeenCalledOnce(); expect(offline).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
