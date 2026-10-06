import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useClipPageVisible } from './useClipPageVisible';
beforeEach(() => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }));
afterEach(cleanup);
it('pauses on native background even when the WebView still reports visible', () => {
  const hook = renderHook(useClipPageVisible);
  act(() => document.dispatchEvent(new CustomEvent('app-paused', { bubbles: true })));
  expect(hook.result.current).toBe(false);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(hook.result.current).toBe(false);
  act(() => document.dispatchEvent(new CustomEvent('app-resumed', { bubbles: true })));
  expect(hook.result.current).toBe(true);
});
it('a native resume cannot start playback while the document is hidden', () => {
  const hook = renderHook(useClipPageVisible);
  act(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new CustomEvent('app-resumed', { bubbles: true }));
  });
  expect(hook.result.current).toBe(false);
  act(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(hook.result.current).toBe(true);
});
