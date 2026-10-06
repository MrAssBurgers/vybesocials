import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, enabled: false, revision: 'a'.repeat(48), invoke: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const { uid, epoch } = state;
  return { ready: !!uid, user: { id: uid }, profile: { id: `profile-${uid}`, user_id: uid }, session: { uid, epoch }, guard: () => { if (state.uid !== uid || state.epoch !== epoch) throw new Error('account changed'); } };
} }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { useBackgroundLocation } from './useBackgroundLocation';
import { locationRead } from '@/test/locationSharingFixtures';
const gps = { getCurrentPosition: vi.fn(), watchPosition: vi.fn(() => 17), clearWatch: vi.fn() }, permission = vi.fn();
const clients: QueryClient[] = [];
function wrapper() { const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData, staleTime: Infinity, gcTime: 14 * 86400000, refetchOnMount: false } } }); clients.push(client); return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
const sample = () => ({ timestamp: Date.now(), coords: { latitude: 10, longitude: 20, accuracy: 30, speed: 0, heading: null } });
function response(input: Record<string, unknown>) {
  const base = { ok: true, ownerUid: input.expectedOwnerUid, profileId: input.expectedProfileId, action: input.action, requestId: input.requestId ?? null, serverTime: Date.now() };
  if (input.action === 'read') return { data: { ...locationRead({ shares: [], locations: [] }), ...base, state: { revision: state.revision, enabled: state.enabled, updatedAt: new Date().toISOString() } }, error: null };
  if (input.action === 'setSharing') { state.enabled = input.enabled as boolean; state.revision = 'd'.repeat(48); return { data: { ...base, state: { enabled: state.enabled, revision: state.revision, updatedAt: new Date().toISOString() } }, error: null }; }
  return { data: { ...base, sharingRevision: input.sharingRevision, sampledAt: input.sampledAt, expiresAt: new Date(Date.now() + 120000).toISOString() }, error: null };
}
beforeEach(() => {
  vi.clearAllMocks(); state.uid = 'alice'; state.epoch = 1; state.enabled = false; state.revision = 'a'.repeat(48); state.invoke.mockImplementation(async (_, input) => response(input));
  permission.mockResolvedValue({ state: 'prompt' }); sessionStorage.clear();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: gps }); Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: permission } }); Object.defineProperty(navigator, 'getBattery', { configurable: true, value: undefined }); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  // Each case starts a foreground app, including the shared map read phase.
  window.dispatchEvent(new Event('app-resumed'));
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; });
const create = () => renderHook(() => useBackgroundLocation(`profile-${state.uid}`, { watchOnMap: true }), { wrapper: wrapper() });
describe('map GPS consent and checked publication', () => {
  it('remembers a native pause before the map mounts and starts GPS only after resume', async () => {
    act(() => window.dispatchEvent(new Event('app-paused')));
    const hook = create();
    act(() => hook.result.current.requestLocation());
    expect(gps.getCurrentPosition).not.toHaveBeenCalled();
    expect(gps.watchPosition).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event('app-resumed')));
    await waitFor(() => expect(gps.watchPosition).toHaveBeenCalledOnce());
    expect(gps.getCurrentPosition).toHaveBeenCalledOnce();
    expect(state.invoke.mock.calls.some(([, input]) => input.action === 'publishPosition' || input.action === 'setSharing')).toBe(false);
  });
  it('retires a location setting before transport if the app pauses during its continuation', async () => {
    const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    await act(async () => {
      const change = hook.result.current.setSharing(true);
      window.dispatchEvent(new Event('app-paused'));
      await expect(change).rejects.toThrow(/Open the app/);
    });
    expect(state.invoke.mock.calls.some(([, input]) => input.action === 'setSharing')).toBe(false);
    expect(state.enabled).toBe(false);
  });
  it('defers an expired Ghost timer during native pause and resumes the checked return once foregrounded', async () => {
    state.enabled = true;
    const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    vi.useFakeTimers();
    try {
      await act(async () => { await hook.result.current.enableTemporaryGhost(60_000); });
      expect(state.enabled).toBe(false);
      act(() => window.dispatchEvent(new Event('app-paused')));
      const before = state.invoke.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(60_001); });
      expect(state.invoke.mock.calls).toHaveLength(before);
      expect(state.enabled).toBe(false);
      act(() => window.dispatchEvent(new Event('app-resumed')));
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      expect(state.enabled).toBe(true);
      expect(state.invoke.mock.calls.filter(([, input]) => input.action === 'setSharing' && input.enabled === true)).toHaveLength(1);
      expect(gps.getCurrentPosition).not.toHaveBeenCalled();
      expect(gps.watchPosition).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('retires a pending Ghost read across pause/resume and coalesces duplicate return events', async () => {
    state.enabled = true;
    const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    vi.useFakeTimers();
    try {
      await act(async () => { await hook.result.current.enableTemporaryGhost(60_000); });
      const finishes: (() => void)[] = [];
      const until = hook.result.current.ghostUntil!;
      let block = true;
      state.invoke.mockImplementation(async (_, input) => {
        if (input.action === 'read' && Date.now() >= until && block) {
          const answer = response(input);
          return new Promise(resolve => { finishes.push(() => resolve(answer)); });
        }
        return response(input);
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(60_001); });
      expect(finishes.length).toBeGreaterThan(0);
      act(() => {
        window.dispatchEvent(new Event('app-paused'));
        window.dispatchEvent(new Event('app-resumed'));
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(state.enabled).toBe(false);
      await act(async () => { block = false; finishes.forEach(finish => finish()); await vi.advanceTimersByTimeAsync(100); });
      expect(state.enabled).toBe(true);
      expect(state.invoke.mock.calls.filter(([, input]) => input.action === 'setSharing' && input.enabled === true)).toHaveLength(1);
      expect(gps.getCurrentPosition).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('does not restore sharing when a later device changed the Ghost revision', async () => {
    state.enabled = true;
    const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    vi.useFakeTimers();
    try {
      await act(async () => { await hook.result.current.enableTemporaryGhost(60_000); });
      state.revision = 'e'.repeat(48);
      await act(async () => { await vi.advanceTimersByTimeAsync(60_001); });
      expect(state.enabled).toBe(false);
      expect(state.invoke.mock.calls.some(([, input]) => input.action === 'setSharing' && input.enabled === true)).toBe(false);
      expect(hook.result.current.ghostUntil).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it('rechecks a return committed before pause without replaying it or leaving uploads blocked', async () => {
    state.enabled = true;
    const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    act(() => hook.result.current.requestLocation());
    vi.useFakeTimers();
    try {
      await act(async () => { await hook.result.current.enableTemporaryGhost(60_000); });
      state.invoke.mockImplementation(async (_, input) => {
        const answer = response(input);
        if (input.action === 'setSharing' && input.enabled === true) window.dispatchEvent(new Event('app-paused'));
        return answer;
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(60_001); });
      expect(state.enabled).toBe(true);
      expect(hook.result.current.sharing).toBe(false);
      act(() => window.dispatchEvent(new Event('app-resumed')));
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      expect(hook.result.current.ghostUntil).toBeNull();
      expect(state.invoke.mock.calls.filter(([, input]) => input.action === 'setSharing' && input.enabled === true)).toHaveLength(1);
      await act(async () => gps.watchPosition.mock.calls.at(-1)![0](sample()));
      expect(state.invoke.mock.calls.filter(([, input]) => input.action === 'publishPosition')).toHaveLength(1);
      expect(hook.result.current.sharing).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it('retires a battery-delayed upload and old fresh samples across a visible native pause and resume', async () => {
    state.enabled = true;
    let finishBattery!: (value: { level: number }) => void;
    Object.defineProperty(navigator, 'getBattery', { configurable: true, value: () => new Promise(resolve => { finishBattery = resolve; }) });
    const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    act(() => hook.result.current.requestLocation());
    const oldFresh = gps.getCurrentPosition.mock.calls.filter(([, , options]) => options.maximumAge === 0)[0][0];
    await act(async () => gps.watchPosition.mock.calls[0][0](sample()));
    act(() => window.dispatchEvent(new Event('app-paused')));
    await act(async () => finishBattery({ level: 0.5 }));
    act(() => window.dispatchEvent(new Event('app-resumed')));
    await act(async () => oldFresh(sample()));
    expect(state.invoke.mock.calls.some(([, input]) => input.action === 'publishPosition')).toBe(false);
    expect(hook.result.current.sharing).toBe(false);
  });
  it('does not restart fresh GPS during a visible native pause, including a same-turn visibility event', async () => {
    state.enabled = true;
    const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    act(() => hook.result.current.requestLocation());
    const before = gps.getCurrentPosition.mock.calls.length;
    act(() => {
      window.dispatchEvent(new Event('app-paused'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(gps.getCurrentPosition).toHaveBeenCalledTimes(before);
    act(() => hook.result.current.requestLocation());
    expect(gps.getCurrentPosition).toHaveBeenCalledTimes(before);
    expect(gps.watchPosition).toHaveBeenCalledOnce();
    act(() => window.dispatchEvent(new Event('app-resumed')));
    await waitFor(() => expect(gps.watchPosition).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    const fresh = gps.getCurrentPosition.mock.calls.filter(([, , options]) => options.maximumAge === 0).at(-1)![0];
    await act(async () => fresh(sample()));
    expect(state.invoke.mock.calls.filter(([, input]) => input.action === 'publishPosition')).toHaveLength(1);
    expect(state.invoke.mock.calls.some(([, input]) => input.action === 'setSharing')).toBe(false);
  });
  it('rechecks an approved stationary share immediately on reconnect using a fresh GPS sample', async () => {
    state.enabled = true;
    const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    act(() => hook.result.current.requestLocation());
    const freshCalls = () => gps.getCurrentPosition.mock.calls.filter(([, , options]) => options.maximumAge === 0);
    await act(async () => freshCalls()[0][0](sample()));
    const before = freshCalls().length;
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    await waitFor(() => expect(freshCalls().length).toBeGreaterThan(before));
    expect(state.invoke.mock.calls.some(([, input]) => input.action === 'setSharing')).toBe(false);
  });
  it('retires native background GPS callbacks and restarts only the requested watch on resume', async () => {
    const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    act(() => hook.result.current.requestLocation());
    const old = gps.watchPosition.mock.calls[0][0];
    act(() => document.dispatchEvent(new CustomEvent('app-paused', { bubbles: true })));
    await act(async () => old(sample()));
    expect(hook.result.current.coords).toBeNull(); expect(gps.clearWatch).toHaveBeenCalledWith(17);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(gps.watchPosition).toHaveBeenCalledOnce();
    act(() => document.dispatchEvent(new CustomEvent('app-resumed', { bubbles: true })));
    expect(gps.watchPosition).toHaveBeenCalledTimes(2);
    await act(async () => old(sample())); expect(hook.result.current.coords).toBeNull();
    await act(async () => gps.watchPosition.mock.calls[1][0](sample())); expect(hook.result.current.coords).toEqual([10, 20]);
    expect(state.invoke.mock.calls.some(([, input]) => input.action === 'setSharing' || input.action === 'publishPosition')).toBe(false);
  });
  it('does not prompt on map entry; the existing explicit action starts GPS', async () => {
    const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    expect(gps.getCurrentPosition).not.toHaveBeenCalled(); expect(gps.watchPosition).not.toHaveBeenCalled();
    act(() => hook.result.current.requestLocation()); expect(gps.getCurrentPosition).toHaveBeenCalledOnce(); expect(gps.watchPosition).toHaveBeenCalledOnce();
  });
  it('keeps already-granted positioning, without trusting old local consent', async () => {
    localStorage.setItem('vybe-map-sharing', 'true'); permission.mockResolvedValue({ state: 'granted' }); const hook = create();
    await waitFor(() => expect(gps.watchPosition).toHaveBeenCalledOnce());
    await act(async () => gps.watchPosition.mock.calls[0][0](sample()));
    expect(hook.result.current.sharing).toBe(false); expect(state.invoke.mock.calls.some(([, input]) => input.action === 'publishPosition')).toBe(false);
  });
  it('does not start GPS away from the map', () => {
    permission.mockResolvedValue({ state: 'granted' }); renderHook(() => useBackgroundLocation('profile-alice', { watchOnMap: false }), { wrapper: wrapper() });
    expect(permission).not.toHaveBeenCalled(); expect(gps.watchPosition).not.toHaveBeenCalled();
  });
  it('stops watchers and refuses old callbacks after teardown', async () => {
    state.enabled = true; const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    act(() => hook.result.current.requestLocation()); const callback = gps.watchPosition.mock.calls[0][0]; hook.unmount();
    await act(async () => callback(sample())); expect(gps.clearWatch).toHaveBeenCalledWith(17);
    expect(state.invoke.mock.calls.some(([, input]) => input.action === 'publishPosition')).toBe(false);
  });
  it('cannot send a delayed battery/GPS sample after Stop', async () => {
    state.enabled = true; let battery!: (value: { level: number }) => void;
    Object.defineProperty(navigator, 'getBattery', { configurable: true, value: () => new Promise(resolve => { battery = resolve; }) });
    const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    act(() => hook.result.current.requestLocation()); await act(async () => gps.watchPosition.mock.calls[0][0](sample()));
    await act(async () => { await hook.result.current.setSharing(false); });
    await act(async () => { battery({ level: 0.5 }); });
    expect(state.invoke.mock.calls.some(([, input]) => input.action === 'publishPosition')).toBe(false); expect(hook.result.current.sharingEnabled).toBe(false);
  });
  it('a stalled optional battery API cannot stall location publication forever', async () => {
    state.enabled = true;
    Object.defineProperty(navigator, 'getBattery', { configurable: true, value: () => new Promise(() => {}) });
    const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    act(() => hook.result.current.requestLocation()); await act(async () => gps.watchPosition.mock.calls[0][0](sample()));
    await waitFor(() => expect(state.invoke.mock.calls.some(([, input]) => input.action === 'publishPosition')).toBe(true));
    const input = state.invoke.mock.calls.find(([, input]) => input.action === 'publishPosition')![1]; expect(input.batteryPercent).toBeNull();
  });
  it('clears coordinates and refuses callbacks through Alice→Bob→Alice', async () => {
    const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    act(() => hook.result.current.requestLocation()); const callback = gps.watchPosition.mock.calls[0][0]; await act(async () => callback(sample()));
    expect(hook.result.current.coords).toEqual([10, 20]);
    act(() => { state.uid = 'bob'; state.epoch++; hook.rerender(); }); expect(hook.result.current.coords).toBeNull();
    act(() => { state.uid = 'alice'; state.epoch++; hook.rerender(); }); await act(async () => callback(sample()));
    expect(hook.result.current.coords).toBeNull();
  });
  it('requires a valid position receipt before declaring live', async () => {
    state.enabled = true; let finish!: (value: unknown) => void;
    state.invoke.mockImplementation(async (_, input) => input.action === 'publishPosition' ? new Promise(resolve => { finish = resolve; }) : response(input));
    const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    act(() => hook.result.current.requestLocation()); await act(async () => gps.watchPosition.mock.calls[0][0](sample()));
    expect(hook.result.current.sharing).toBe(false);
    const input = state.invoke.mock.calls.find(([, input]) => input.action === 'publishPosition')![1];
    await act(async () => finish(response(input))); expect(hook.result.current.sharing).toBe(true);
  });
  it('retains original toggle identity after a committed but lost reply', async () => {
    let saved: ReturnType<typeof response> | null = null;
    state.invoke.mockImplementation(async (_, input) => {
      if (input.action !== 'setSharing') return response(input);
      if (!saved) { saved = response(input); return { data: null, error: { code: 'unavailable', message: 'Reply lost' } }; }
      return saved;
    });
    const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    await act(async () => { await expect(hook.result.current.setSharing(true)).rejects.toThrow('Reply lost'); }); expect(hook.result.current.sharing).toBe(false);
    act(() => hook.result.current.retrySharing());
    await waitFor(() => expect(state.invoke.mock.calls.filter(([, input]) => input.action === 'setSharing')).toHaveLength(2));
    await waitFor(() => expect(hook.result.current.sharingPending).toBe(false));
    const attempts = state.invoke.mock.calls.filter(([, input]) => input.action === 'setSharing').map(([, input]) => input);
    expect(attempts).toHaveLength(2); expect(attempts[1]).toEqual(attempts[0]);
  });
});


describe('explicit GPS recovery', () => {
  it('restarts a failed watcher on an explicit retry and ignores its retired callback', async () => {
    const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    act(() => hook.result.current.requestLocation());
    const oldSuccess = gps.watchPosition.mock.calls[0][0];
    act(() => gps.watchPosition.mock.calls[0][1]({ code: 1, message: 'Permission denied' }));
    expect(hook.result.current.locationDenied).toBe(true);
    act(() => hook.result.current.requestLocation());
    expect(gps.watchPosition).toHaveBeenCalledTimes(2);
    expect(gps.clearWatch).toHaveBeenCalledWith(17);
    await act(async () => oldSuccess(sample()));
    expect(hook.result.current.coords).toBeNull();
    await act(async () => gps.watchPosition.mock.calls[1][0](sample()));
    expect(hook.result.current.coords).toEqual([10, 20]);
    expect(hook.result.current.locationDenied).toBe(false);
    expect(hook.result.current.sharingError).toBeNull();
    expect(state.invoke.mock.calls.some(([, input]) => input.action === 'publishPosition')).toBe(false);
  });
  it('clears a permission error after successful local positioning in Ghost Mode', async () => {
    const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
    act(() => hook.result.current.requestLocation());
    act(() => gps.watchPosition.mock.calls[0][1]({ code: 1, message: 'Permission denied' }));
    expect(hook.result.current.sharingError).toMatch(/permission is denied/);
    act(() => hook.result.current.requestLocation());
    await act(async () => gps.watchPosition.mock.calls.at(-1)![0](sample()));
    expect(hook.result.current.locationAvailable).toBe(true);
    expect(hook.result.current.sharingError).toBeNull();
    expect(hook.result.current.sharingEnabled).toBe(false);
    expect(state.invoke.mock.calls.some(([, input]) => input.action === 'publishPosition')).toBe(false);
  });
});

it('reports a failed coarse fallback and the explicit Retry action restarts GPS without enabling sharing', async () => {
  const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
  act(() => hook.result.current.requestLocation());
  act(() => gps.watchPosition.mock.calls[0][1]({ code: 3, message: 'Timeout' }));
  expect(gps.watchPosition).toHaveBeenCalledTimes(2);
  act(() => gps.watchPosition.mock.calls[1][1]({ code: 2, message: 'Unavailable' }));
  expect(hook.result.current.sharingError).toMatch(/could not get a location/);
  act(() => hook.result.current.retrySharing());
  await waitFor(() => expect(gps.watchPosition).toHaveBeenCalledTimes(3));
  expect(hook.result.current.sharingEnabled).toBe(false);
  expect(state.invoke.mock.calls.some(([, input]) => input.action === 'setSharing' || input.action === 'publishPosition')).toBe(false);
  await act(async () => gps.watchPosition.mock.calls[2][0](sample()));
  expect(hook.result.current.sharingError).toBeNull();
});
it('a local GPS success cannot clear an unconfirmed sharing publication error', async () => {
  state.enabled = true;
  state.invoke.mockImplementation(async (_, input) => input.action === 'publishPosition' ? { data: null, error: { code: 'unavailable', message: 'Share upload failed' } } : response(input));
  const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
  act(() => hook.result.current.requestLocation());
  await act(async () => gps.watchPosition.mock.calls[0][0](sample()));
  expect(hook.result.current.sharingError).toBe('Share upload failed');
  await act(async () => gps.watchPosition.mock.calls[0][0](sample()));
  expect(hook.result.current.locationAvailable).toBe(true);
  expect(hook.result.current.sharingError).toBe('Share upload failed');
  expect(hook.result.current.sharing).toBe(false);
});
it('retires every pending GPS callback when permission is denied until the user explicitly retries', async () => {
  state.enabled = true;
  const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
  act(() => hook.result.current.requestLocation());
  const staleWatch = gps.watchPosition.mock.calls[0][0];
  const staleInitial = gps.getCurrentPosition.mock.calls[0][0];
  act(() => gps.watchPosition.mock.calls[0][1]({ code: 1, message: 'Permission denied' }));
  await act(async () => { staleWatch(sample()); staleInitial(sample()); });
  expect(hook.result.current.locationDenied).toBe(true);
  expect(hook.result.current.coords).toBeNull();
  expect(state.invoke.mock.calls.some(([, input]) => input.action === 'publishPosition')).toBe(false);
  expect(gps.clearWatch).toHaveBeenCalledWith(17);
  act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  expect(gps.watchPosition).toHaveBeenCalledOnce();
  expect(hook.result.current.locationDenied).toBe(true);
  act(() => hook.result.current.requestLocation());
  await act(async () => gps.watchPosition.mock.calls.at(-1)![0](sample()));
  expect(hook.result.current.locationDenied).toBe(false);
  expect(hook.result.current.coords).toEqual([10, 20]);
});
it('a deferred fresh sample is retired when the user restarts GPS', async () => {
  state.enabled = true;
  const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
  act(() => hook.result.current.requestLocation());
  const fresh = gps.getCurrentPosition.mock.calls.find(([, , options]) => options.maximumAge === 0)![0];
  act(() => hook.result.current.requestLocation());
  await act(async () => fresh(sample()));
  expect(state.invoke.mock.calls.some(([, input]) => input.action === 'publishPosition')).toBe(false);
});

it('rejects callbacks from a watch stopped before backgrounding, after the map resumes', async () => {
  const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
  act(() => hook.result.current.requestLocation());
  const oldSuccess = gps.watchPosition.mock.calls[0][0], oldFailure = gps.watchPosition.mock.calls[0][1];
  act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await act(async () => gps.watchPosition.mock.calls[1][0](sample()));
  await act(async () => oldSuccess({ ...sample(), coords: { ...sample().coords, latitude: 70 } }));
  act(() => oldFailure({ code: 1, message: 'Old denied result' }));
  expect(hook.result.current.coords).toEqual([10, 20]);
  expect(hook.result.current.locationDenied).toBe(false);
  expect(hook.result.current.sharingError).toBeNull();
});

it('keeps a stationary approved share fresh without enabling sharing or requesting GPS in the background', async () => {
  state.enabled = true;
  const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
  vi.useFakeTimers();
  try {
    act(() => hook.result.current.requestLocation());
    const freshCalls = () => gps.getCurrentPosition.mock.calls.filter(([, , options]) => options.maximumAge === 0);
    await act(async () => freshCalls()[0][0](sample()));
    const before = freshCalls().length;
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });
    expect(freshCalls().length).toBe(before + 1);
    await act(async () => freshCalls().at(-1)![0](sample()));
    expect(state.invoke.mock.calls.filter(([, input]) => input.action === 'publishPosition')).toHaveLength(2);
    act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    const hiddenCount = gps.getCurrentPosition.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(gps.getCurrentPosition.mock.calls).toHaveLength(hiddenCount);
    expect(state.invoke.mock.calls.some(([, input]) => input.action === 'setSharing')).toBe(false);
  } finally { vi.useRealTimers(); }
});

it('retires a delayed fresh sample across background/resume and stops periodic requests on permission denial', async () => {
  state.enabled = true;
  const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
  act(() => hook.result.current.requestLocation());
  const beforeHide = gps.getCurrentPosition.mock.calls.find(([, , options]) => options.maximumAge === 0)![0];
  act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await act(async () => beforeHide(sample()));
  expect(state.invoke.mock.calls.some(([, input]) => input.action === 'publishPosition')).toBe(false);
  act(() => gps.watchPosition.mock.calls.at(-1)![1]({ code: 1, message: 'Denied' }));
  const requests = gps.getCurrentPosition.mock.calls.length;
  vi.useFakeTimers();
  try { await act(async () => { await vi.advanceTimersByTimeAsync(90_000); }); expect(gps.getCurrentPosition.mock.calls).toHaveLength(requests); }
  finally { vi.useRealTimers(); }
});

it('retires a fresh-sample timeout before a later periodic attempt and ignores the old answer', async () => {
  state.enabled = true;
  const hook = create(); await waitFor(() => expect(hook.result.current.sharingReady).toBe(true));
  vi.useFakeTimers();
  try {
    act(() => hook.result.current.requestLocation());
    const old = gps.getCurrentPosition.mock.calls.find(([, , options]) => options.maximumAge === 0)![0];
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });
    await act(async () => old(sample()));
    expect(state.invoke.mock.calls.some(([, input]) => input.action === 'publishPosition')).toBe(false);
    await act(async () => gps.getCurrentPosition.mock.calls.filter(([, , options]) => options.maximumAge === 0).at(-1)![0](sample()));
    expect(state.invoke.mock.calls.filter(([, input]) => input.action === 'publishPosition')).toHaveLength(1);
  } finally { vi.useRealTimers(); }
});
