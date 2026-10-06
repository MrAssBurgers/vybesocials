import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { recoverTokenTransport } from './tokenTransportRecovery';
import '@/hooks/useForegroundReadPhase';
let stop = () => {};
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  window.dispatchEvent(new Event('app-resumed'));
});
afterEach(() => { stop(); vi.useRealTimers(); });
it('bounds automatic retries and removes listeners after success', async () => {
  const retry = vi.fn(async () => false); stop = recoverTokenTransport(retry, () => true);
  await vi.advanceTimersByTimeAsync(2000); expect(retry).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(8000); expect(retry).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(120000); expect(retry).toHaveBeenCalledTimes(2);
  retry.mockResolvedValue(true); window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(0);
  window.dispatchEvent(new Event('app-resumed')); await vi.advanceTimersByTimeAsync(20000);
  expect(retry).toHaveBeenCalledTimes(3);
});
it.each(['hidden', 'offline', 'paused', 'retired', 'stopped'])('does not request a token while %s', async kind => {
  const retry = vi.fn(async () => false); let current = true;
  stop = recoverTokenTransport(retry, () => current);
  if (kind === 'hidden') Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  if (kind === 'offline') Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  if (kind === 'paused') window.dispatchEvent(new Event('app-paused'));
  if (kind === 'retired') current = false;
  if (kind === 'stopped') stop();
  window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(20000);
  expect(retry).not.toHaveBeenCalled();
});
it('coalesces foreground notifications while a request is pending', async () => {
  let resolve!: (ready: boolean) => void;
  const retry = vi.fn(() => new Promise<boolean>(done => { resolve = done; }));
  stop = recoverTokenTransport(retry, () => true);
  window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('app-resumed'));
  document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(20000);
  expect(retry).toHaveBeenCalledOnce(); resolve(true); await vi.advanceTimersByTimeAsync(0);
});
it('waits for resume when token recovery starts after a native pause', async () => {
  window.dispatchEvent(new Event('app-paused'));
  const retry = vi.fn(async () => true);
  stop = recoverTokenTransport(retry, () => true);
  window.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(20_000);
  expect(retry).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('app-resumed'));
  await vi.advanceTimersByTimeAsync(0);
  expect(retry).toHaveBeenCalledOnce();
});
it('does not forget a pause when a retired recovery is replaced', async () => {
  stop = recoverTokenTransport(vi.fn(async () => false), () => true);
  window.dispatchEvent(new Event('app-paused'));
  stop();
  const retry = vi.fn(async () => true);
  stop = recoverTokenTransport(retry, () => true);
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(20_000);
  expect(retry).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('app-resumed'));
  await vi.advanceTimersByTimeAsync(0);
  expect(retry).toHaveBeenCalledOnce();
});
