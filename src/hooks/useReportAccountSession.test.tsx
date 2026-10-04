import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ uid: 'alice' as string | null, listeners: new Set<(user: { uid: string } | null) => void>() }));
const auth = vi.hoisted(() => ({
  get currentUser() { return state.uid ? { uid: state.uid } : null; },
  onAuthStateChanged(listener: (user: { uid: string } | null) => void) {
    state.listeners.add(listener);
    return () => { state.listeners.delete(listener); };
  },
}));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
import { reportAccountGuard, reportAccountSnapshot, reportAccountSubscribe } from '@/lib/reportModerationService';
import { useReportAccountSession } from './useReportAccountSession';

function switchTo(uid: string | null) {
  state.uid = uid;
  for (const listener of state.listeners) listener(uid ? { uid } : null);
}
beforeEach(() => { switchTo('alice'); });
afterEach(cleanup);

describe('reactive report account sessions', () => {
  it('updates an already mounted signed-out view when Firebase restores the user', () => {
    switchTo(null);
    const { result } = renderHook(useReportAccountSession);
    const pending = result.current;
    expect(pending.uid).toBeUndefined();
    act(() => switchTo('alice'));
    expect(result.current.uid).toBe('alice');
    expect(result.current.epoch).toBeGreaterThan(pending.epoch);
  });

  it('keeps one stable snapshot when identity has not changed', () => {
    let renders = 0;
    const { result } = renderHook(() => { renders += 1; return useReportAccountSession(); });
    const initial = result.current;
    expect(reportAccountSnapshot()).toBe(initial);
    expect(reportAccountSnapshot()).toBe(initial);
    const previousRenders = renders;
    act(() => switchTo('alice'));
    expect(result.current).toBe(initial);
    expect(renders).toBe(previousRenders);
    expect(Object.isFrozen(initial)).toBe(true);
  });

  it('invalidates a previous action when Alice returns after Bob without a manual render', () => {
    const { result } = renderHook(useReportAccountSession);
    const initial = result.current;
    const previousGuard = reportAccountGuard('alice');
    act(() => { switchTo('bob'); switchTo('alice'); });
    expect(result.current.uid).toBe('alice');
    expect(result.current.epoch).toBe(initial.epoch + 2);
    expect(previousGuard).toThrow('Your account changed');
    expect(reportAccountGuard('alice')).not.toThrow();
  });

  it('removes view subscriptions without disconnecting another view or imperative guard', () => {
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = reportAccountSubscribe(first);
    const stopSecond = reportAccountSubscribe(second);
    const previousGuard = reportAccountGuard('alice');
    stopFirst();
    switchTo('bob');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    stopSecond();
    switchTo('alice');
    expect(second).toHaveBeenCalledTimes(1);
    expect(previousGuard).toThrow('Your account changed');
  });
});
