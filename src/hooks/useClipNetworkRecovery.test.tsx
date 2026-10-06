import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClipNetworkRecovery } from './useClipNetworkRecovery';

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  window.dispatchEvent(new Event('app-resumed'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
function fixture() {
  const video = document.createElement('video');
  const load = vi.spyOn(video, 'load').mockImplementation(() => {});
  Object.defineProperty(video, 'readyState', { configurable: true, value: 0 });
  const ref = { current: video }, paused = { current: false }, reload = vi.fn();
  const hook = renderHook(({ active, source, scope }) => useClipNetworkRecovery(ref, active, source, scope, paused, reload),
    { initialProps: { active: true, source: 'https://example.test/clip.mp4', scope: 'alice:1' } });
  return { video, load, ref, paused, reload, hook };
}
describe('foreground clip buffering recovery', () => {
  it('does not reload a clip when native pause and reconnect arrive before the card rerenders', () => {
    const f = fixture();
    Object.defineProperty(f.video, 'error', { configurable: true, value: { code: 2 } });
    act(() => {
      window.dispatchEvent(new Event('app-paused'));
      window.dispatchEvent(new Event('online'));
      f.video.dispatchEvent(new Event('error'));
      vi.advanceTimersByTime(12_000);
    });
    expect(f.load).not.toHaveBeenCalled();
    expect(f.reload).not.toHaveBeenCalled();
  });
  it('ignores a retained Retry action after switching clips or unmounting', () => {
    const f = fixture();
    const previousRetry = f.hook.result.current.retry;
    f.hook.rerender({ active: true, source: 'https://example.test/other.mp4', scope: 'bob:2' });
    act(() => previousRetry());
    expect(f.load).not.toHaveBeenCalled();
    const departedRetry = f.hook.result.current.retry;
    f.hook.unmount();
    act(() => departedRetry());
    expect(f.load).not.toHaveBeenCalled();
  });
  it('recovers a network error received after playback started, once per failure', () => {
    const f = fixture();
    Object.defineProperty(f.video, 'readyState', { configurable: true, value: 4 });
    act(() => f.video.dispatchEvent(new Event('playing')));
    Object.defineProperty(f.video, 'error', { configurable: true, value: { code: 2 } });
    act(() => f.video.dispatchEvent(new Event('error')));
    expect(f.load).toHaveBeenCalledOnce();
    act(() => { f.video.dispatchEvent(new Event('error')); vi.advanceTimersByTime(12_000); });
    expect(f.load).toHaveBeenCalledOnce();
    expect(f.hook.result.current.stalled).toBe(true);
  });
  it('retries a silent loading stall once, then offers retry instead of spinning forever', () => {
    const f = fixture();
    act(() => vi.advanceTimersByTime(12_000));
    expect(f.load).toHaveBeenCalledOnce(); expect(f.reload).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(12_000));
    expect(f.hook.result.current.stalled).toBe(true);
    act(() => vi.advanceTimersByTime(120_000)); expect(f.load).toHaveBeenCalledOnce();
    act(() => f.hook.result.current.retry());
    expect(f.hook.result.current.stalled).toBe(false); expect(f.load).toHaveBeenCalledTimes(2);
  });
  it('recovers on reconnect even when the browser did not emit a MediaError', () => {
    const f = fixture();
    act(() => window.dispatchEvent(new Event('online')));
    expect(f.load).toHaveBeenCalledOnce();
    Object.defineProperty(f.video, 'readyState', { configurable: true, value: 4 });
    act(() => { f.video.dispatchEvent(new Event('playing')); window.dispatchEvent(new Event('online')); vi.advanceTimersByTime(30_000); });
    expect(f.load).toHaveBeenCalledOnce(); expect(f.hook.result.current.stalled).toBe(false);
  });
  it('repeated buffering events cannot postpone recovery indefinitely', () => {
    const f = fixture();
    for (let i = 0; i < 4; i++) act(() => { vi.advanceTimersByTime(3_000); f.video.dispatchEvent(new Event('stalled')); });
    expect(f.load).toHaveBeenCalledOnce();
    Object.defineProperty(f.video, 'readyState', { configurable: true, value: 4 });
    act(() => f.video.dispatchEvent(new Event('playing')));
    Object.defineProperty(f.video, 'readyState', { configurable: true, value: 2 });
    act(() => { f.video.dispatchEvent(new Event('waiting')); vi.advanceTimersByTime(12_000); });
    expect(f.load).toHaveBeenCalledTimes(2);
  });
  it.each(['paused', 'hidden', 'offline', 'inactive', 'decoder'] as const)('leaves %s playback alone', kind => {
    const f = fixture();
    if (kind === 'paused') f.paused.current = true;
    if (kind === 'hidden') Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    if (kind === 'offline') Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    if (kind === 'decoder') Object.defineProperty(f.video, 'error', { configurable: true, value: { code: 3 } });
    if (kind === 'inactive') f.hook.rerender({ active: false, source: 'https://example.test/clip.mp4', scope: 'alice:1' });
    act(() => { f.video.dispatchEvent(new Event('error')); window.dispatchEvent(new Event('online')); vi.advanceTimersByTime(60_000); });
    expect(f.load).not.toHaveBeenCalled(); expect(f.hook.result.current.stalled).toBe(false);
  });
  it('retires old timers on an account or source change and teardown', () => {
    const f = fixture();
    act(() => vi.advanceTimersByTime(10_000));
    f.hook.rerender({ active: true, source: 'https://example.test/other.mp4', scope: 'bob:2' });
    act(() => vi.advanceTimersByTime(2_000)); expect(f.load).not.toHaveBeenCalled();
    f.hook.unmount(); act(() => { vi.advanceTimersByTime(30_000); window.dispatchEvent(new Event('online')); });
    expect(f.load).not.toHaveBeenCalled();
  });
});
