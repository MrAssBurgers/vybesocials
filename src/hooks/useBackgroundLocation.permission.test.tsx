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
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; });
const create = () => renderHook(() => useBackgroundLocation(`profile-${state.uid}`, { watchOnMap: true }), { wrapper: wrapper() });
describe('map GPS consent and checked publication', () => {
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
