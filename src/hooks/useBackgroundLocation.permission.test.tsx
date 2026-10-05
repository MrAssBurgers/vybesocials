import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ upsert: vi.fn(), disable: vi.fn(), append: vi.fn(), sharing: false }));
vi.mock('@/lib/vybemap/firestore', () => ({ upsertLiveLocation: state.upsert, disableLiveLocation: state.disable, appendLocationHistory: state.append }));
vi.mock('@/lib/vybemap/ghostMode', () => ({ persistGhostUntil: vi.fn(), persistSharingPref: vi.fn(), resolveSharingOnLoad: () => ({ sharing: state.sharing, ghostUntil: null }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { useBackgroundLocation } from './useBackgroundLocation';
const gps = { getCurrentPosition: vi.fn(), watchPosition: vi.fn(() => 17), clearWatch: vi.fn() }, permission = vi.fn();
beforeEach(() => { vi.clearAllMocks(); state.sharing = false; state.disable.mockResolvedValue(undefined); state.upsert.mockResolvedValue(undefined); permission.mockResolvedValue({ state: 'prompt' }); Object.defineProperty(navigator, 'geolocation', { configurable: true, value: gps }); Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: permission } }); });
afterEach(cleanup);
describe('map requests GPS only with permission or a current user action', () => {
  it('does not prompt on entering the map; existing recenter action starts the watcher', async () => {
    const hook = renderHook(() => useBackgroundLocation('profile-a', { watchOnMap: true }));
    await waitFor(() => expect(permission).toHaveBeenCalled()); expect(gps.getCurrentPosition).not.toHaveBeenCalled(); expect(gps.watchPosition).not.toHaveBeenCalled();
    act(() => hook.result.current.requestLocation()); expect(gps.getCurrentPosition).toHaveBeenCalledOnce(); expect(gps.watchPosition).toHaveBeenCalledOnce();
  });
  it('preserves already-granted map positioning without a new permission gesture', async () => {
    permission.mockResolvedValue({ state: 'granted' }); renderHook(() => useBackgroundLocation('profile-a', { watchOnMap: true }));
    await waitFor(() => expect(gps.watchPosition).toHaveBeenCalledOnce());
  });
  it('does not start GPS away from the map even if permission is granted', () => {
    permission.mockResolvedValue({ state: 'granted' }); renderHook(() => useBackgroundLocation('profile-a', { watchOnMap: false }));
    expect(permission).not.toHaveBeenCalled(); expect(gps.watchPosition).not.toHaveBeenCalled();
  });
  it('stops watchers and ignores an old GPS result after route teardown', async () => {
    state.sharing = true; const hook = renderHook(() => useBackgroundLocation('profile-a', { watchOnMap: true }));
    act(() => hook.result.current.requestLocation()); const callback = gps.getCurrentPosition.mock.calls[0][0]; hook.unmount();
    await act(async () => callback({ coords: { latitude: 10, longitude: 20, accuracy: 30, speed: 0, heading: null } }));
    expect(gps.clearWatch).toHaveBeenCalledWith(17); expect(state.upsert).not.toHaveBeenCalled(); expect(state.append).not.toHaveBeenCalled();
  });
});
