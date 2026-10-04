import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const account = vi.hoisted(() => ({ uid: 'alice', epoch: 1 }));
vi.mock('./useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = account.uid, epoch = account.epoch;
  return { ready: true, session: { uid, epoch }, profile: { id: `profile-${uid}` }, guard: () => { if (account.uid !== uid || account.epoch !== epoch) throw new Error('Changed'); } };
} }));
import { useApproximateLocation } from './useApproximateLocation';
const gps = vi.fn();
const position = { coords: { latitude: 41.878123, longitude: -87.629876 } } as GeolocationPosition;
beforeEach(() => {
  account.uid = 'alice'; account.epoch = 1; gps.mockReset(); localStorage.clear();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: gps } });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
describe('explicit approximate location', () => {
  it('purges old precise GPS and never requests permission merely by opening Local', () => {
    localStorage.setItem('vybe-user-location', JSON.stringify({ lat: 41.878123, lng: -87.629876 }));
    const hook = renderHook(() => useApproximateLocation(true));
    expect(gps).not.toHaveBeenCalled(); expect(hook.result.current.location).toBeNull(); expect(localStorage.getItem('vybe-user-location')).toBeNull();
    act(() => hook.result.current.requestLocation()); act(() => gps.mock.calls[0][0](position));
    expect(hook.result.current.location).toEqual({ lat: 41.9, lng: -87.6 }); expect(localStorage.length).toBe(0);
  });
  it('does not restore an area when leaving and reopening Local', () => {
    const hook = renderHook(({ enabled }) => useApproximateLocation(enabled), { initialProps: { enabled: true } });
    act(() => hook.result.current.requestLocation()); act(() => gps.mock.calls[0][0](position));
    hook.rerender({ enabled: false }); expect(hook.result.current.location).toBeNull();
    hook.rerender({ enabled: true }); expect(hook.result.current.location).toBeNull(); expect(gps).toHaveBeenCalledTimes(1);
  });
  it('rejects late callbacks across accounts, retries, clears and document hiding', () => {
    const hook = renderHook(() => useApproximateLocation(true));
    act(() => hook.result.current.requestLocation()); account.uid = 'bob'; account.epoch++; hook.rerender();
    act(() => gps.mock.calls[0][0](position)); expect(hook.result.current.location).toBeNull();
    act(() => hook.result.current.requestLocation()); act(() => hook.result.current.requestLocation());
    act(() => gps.mock.calls[1][0](position)); expect(hook.result.current.location).toBeNull();
    act(() => hook.result.current.clearLocation()); act(() => gps.mock.calls[2][0](position)); expect(hook.result.current.location).toBeNull();
    act(() => hook.result.current.requestLocation());
    act(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    act(() => gps.mock.calls[3][0](position));
    act(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(hook.result.current.location).toBeNull(); expect(hook.result.current.pending).toBe(false);
  });
  it('shows denial and invalid GPS as errors without retaining coordinates', () => {
    const hook = renderHook(() => useApproximateLocation(true));
    act(() => hook.result.current.requestLocation()); act(() => gps.mock.calls[0][1]({ code: 1 }));
    expect(hook.result.current.error).toContain('Location access is off'); expect(hook.result.current.pending).toBe(false);
    act(() => hook.result.current.requestLocation()); act(() => gps.mock.calls[1][0]({ coords: { latitude: Infinity, longitude: 0 } }));
    expect(hook.result.current.error).toContain('could not be read'); expect(hook.result.current.location).toBeNull();
  });
});
