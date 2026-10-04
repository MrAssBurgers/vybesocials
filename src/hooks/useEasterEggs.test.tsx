import { StrictMode, type PropsWithChildren } from 'react';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), preferences: vi.fn(), upsert: vi.fn(), toast: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: mocks.toast } }));
vi.mock('@/lib/firebase', () => ({ db: {
  auth: { getUser: mocks.getUser },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.preferences }) }), upsert: mocks.upsert }),
} }));
import { useEasterEggs, useKonamiCode, useMidnightCheck } from './useEasterEggs';

const strict = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('Easter egg discovery and celebrations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 0, 1));
    localStorage.clear();
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: null } });
    mocks.preferences.mockReset().mockResolvedValue({ data: null });
    mocks.upsert.mockReset().mockResolvedValue({ error: null });
    mocks.toast.mockReset();
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('claims midnight once across StrictMode effect replay and still ends its confetti', async () => {
    const save = vi.spyOn(localStorage, 'setItem');
    const hook = renderHook(() => {
      const eggs = useEasterEggs();
      useMidnightCheck(() => { eggs.unlockEgg('midnight'); });
      return eggs;
    }, { wrapper: strict });
    await flush();
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith('🎉 Easter Egg Unlocked: Night Owl!', expect.any(Object));
    expect(save.mock.calls.filter(([key]) => key === 'xd_easter_eggs')).toHaveLength(1);
    expect(hook.result.current.unlockedCount).toBe(1);
    expect(hook.result.current.confetti).toBe(true);
    hook.rerender();
    act(() => vi.advanceTimersByTime(3000));
    expect(hook.result.current.confetti).toBe(false);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it('uses current discoveries for simultaneous and retained callbacks without repeated preference writes', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'alice' } } });
    const hook = renderHook(useEasterEggs, { wrapper: strict });
    await flush();
    const discover = hook.result.current.unlockEgg;
    act(() => {
      expect(discover('midnight')).toBe(true);
      expect(discover('midnight')).toBe(false);
      expect(discover('shake')).toBe(true);
      expect(discover('unknown')).toBe(false);
    });
    await flush();
    expect(hook.result.current.unlockedCount).toBe(2);
    expect(mocks.toast).toHaveBeenCalledTimes(2);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    for (const [payload] of mocks.upsert.mock.calls) {
      expect(payload.user_id).toBe('alice');
      expect(payload.unlocked_easter_eggs).toEqual(['midnight', 'shake']);
    }
    act(() => { expect(discover('shake')).toBe(false); });
    expect(mocks.toast).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it('merges delayed preference hydration with discoveries without announcing old unlocks', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'alice' } } });
    let resolve!: (value: unknown) => void;
    mocks.preferences.mockReturnValue(new Promise(done => { resolve = done; }));
    const hook = renderHook(useEasterEggs);
    await flush();
    const discover = hook.result.current.unlockEgg;
    act(() => { discover('midnight'); });
    await act(async () => { resolve({ data: { unlocked_easter_eggs: ['rainbow', 'not-an-egg'] } }); });
    expect(hook.result.current.unlockedCount).toBe(2);
    expect(hook.result.current.isUnlocked('midnight')).toBe(true);
    act(() => { expect(discover('rainbow')).toBe(false); });
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it('keeps one in-memory discovery when device storage and preference sync are unavailable', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('restricted'); });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('restricted'); });
    mocks.getUser.mockRejectedValue(new Error('offline'));
    const hook = renderHook(useEasterEggs, { wrapper: strict });
    act(() => { hook.result.current.unlockEgg('midnight'); hook.result.current.unlockEgg('midnight'); });
    await flush();
    expect(hook.result.current.isUnlocked('midnight')).toBe(true);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it('does not repeat a persisted discovery after remount and cancels celebration timers', async () => {
    const first = renderHook(useEasterEggs);
    act(() => { first.result.current.unlockEgg('midnight'); first.result.current.triggerRainbow(); });
    await flush();
    expect(vi.getTimerCount()).toBe(2);
    first.unmount();
    expect(vi.getTimerCount()).toBe(0);
    mocks.toast.mockClear();
    const next = renderHook(useEasterEggs);
    act(() => { expect(next.result.current.unlockEgg('midnight')).toBe(false); });
    expect(mocks.toast).not.toHaveBeenCalled();
    next.unmount();
  });

  it('runs a completed Konami sequence once under StrictMode and resets expired partial input', () => {
    const activate = vi.fn();
    const hook = renderHook(() => useKonamiCode(activate), { wrapper: strict });
    const code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
    for (const key of code) fireEvent.keyDown(window, { code: key });
    expect(activate).toHaveBeenCalledTimes(1);
    expect(hook.result.current).toBe(0);
    for (const key of code.slice(0, 3)) fireEvent.keyDown(window, { code: key });
    act(() => vi.advanceTimersByTime(2000));
    for (const key of code.slice(3)) fireEvent.keyDown(window, { code: key });
    expect(activate).toHaveBeenCalledTimes(1);
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
