import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, request: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = state.uid, epoch = state.epoch;
  return { user: { id: uid }, profile: { id: `profile-${uid}`, user_id: uid }, session: { uid, epoch }, ready: !!uid, guard: () => { if (!uid || uid !== state.uid || epoch !== state.epoch) throw new Error('Account changed'); } };
} }));
vi.mock('@/lib/vybemap/mapSocialService', () => ({ mapSocialRequest: (...args: unknown[]) => state.request(...args), mapSocialAttempt: vi.fn() }));
import { useMapSocialItem, useMapSocialRouteAdmission } from './useMapSocial';
import { currentMapSocialRoute, mapRouteAccountScope } from '@/lib/vybemap/mapSocialRouteLease';
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const place = { id: 'spot', name: 'Private destination', latitude: 1, longitude: 2, revision: 'a'.repeat(48) };
const receipt = () => ({ item: place, validUntil: Date.now() + 15_000 });
const scope = () => mapRouteAccountScope(state.uid, `profile-${state.uid}`, state.epoch);
beforeEach(() => { vi.clearAllMocks(); state.uid = 'alice'; state.epoch++; Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: old => old, refetchOnMount: false, gcTime: 14 * 86400_000 } } }); state.request.mockImplementation(async (_actor, _input, guard) => { guard(); return receipt(); }); });
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
describe('private map route admission', () => {
  it('keeps a checked route observed after closing its source sheet and removes it on actual admission denial', async () => {
    const sheet = renderHook(() => useMapSocialItem('place', 'spot'), { wrapper }); await waitFor(() => expect(sheet.result.current.data?.id).toBe('spot'));
    const lease = sheet.result.current.captureRouteLease(); const route = renderHook(() => useMapSocialRouteAdmission(lease), { wrapper }); await waitFor(() => expect(route.result.current?.item?.id).toBe('spot')); sheet.unmount();
    expect(currentMapSocialRoute(client, lease, scope())?.item?.id).toBe('spot');
    state.request.mockResolvedValue({ item: null, validUntil: Date.now() + 15000 }); await act(() => client.refetchQueries({ queryKey: lease.queryKey }));
    await waitFor(() => expect(route.result.current).toBeUndefined()); expect(currentMapSocialRoute(client, lease, scope())).toBeUndefined();
  });
  it('retires route and pending-origin access on the deadline while the refreshing read remains pending', async () => {
    vi.useFakeTimers(); const sheet = renderHook(() => useMapSocialItem('place', 'spot'), { wrapper }); await act(async () => { await vi.advanceTimersByTimeAsync(5); });
    const lease = sheet.result.current.captureRouteLease(), route = renderHook(() => useMapSocialRouteAdmission(lease), { wrapper }); await act(async () => { await vi.advanceTimersByTimeAsync(5); });
    state.request.mockReturnValue(new Promise(() => {})); await act(async () => { await vi.advanceTimersByTimeAsync(15010); });
    expect(route.result.current).toBeUndefined(); expect(currentMapSocialRoute(client, lease, scope())).toBeUndefined();
  });
  it('rejects retained destinations after a newer revision even while the item stays available', async () => {
    const sheet = renderHook(() => useMapSocialItem('place', 'spot'), { wrapper }); await waitFor(() => expect(sheet.result.current.data).toBeDefined()); const lease = sheet.result.current.captureRouteLease();
    const route = renderHook(() => useMapSocialRouteAdmission(lease), { wrapper }); await waitFor(() => expect(route.result.current).toBeDefined());
    state.request.mockResolvedValue({ ...receipt(), item: { ...place, revision: 'b'.repeat(48), latitude: 3 } }); await act(() => client.refetchQueries({ queryKey: lease.queryKey }));
    await waitFor(() => expect(route.result.current).toBeUndefined()); expect(currentMapSocialRoute(client, lease, scope())).toBeUndefined();
  });
  it('never keeps a route after a read failure, hidden page or account ABA', async () => {
    const sheet = renderHook(() => useMapSocialItem('place', 'spot'), { wrapper }); await waitFor(() => expect(sheet.result.current.data).toBeDefined()); const lease = sheet.result.current.captureRouteLease();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); expect(currentMapSocialRoute(client, lease, scope())).toBeUndefined();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); state.epoch += 2; expect(currentMapSocialRoute(client, lease, scope())).toBeUndefined(); state.epoch -= 2;
    state.request.mockRejectedValue(new Error('Read failed')); await act(() => sheet.result.current.refetch()); expect(currentMapSocialRoute(client, lease, scope())).toBeUndefined();
  });
  it('extends the lease only from a newer successful same-revision admission', async () => {
    vi.useFakeTimers(); const sheet = renderHook(() => useMapSocialItem('place', 'spot'), { wrapper }); await act(async () => { await vi.advanceTimersByTimeAsync(5); });
    const lease = sheet.result.current.captureRouteLease(); const original = currentMapSocialRoute(client, lease, scope())!.validUntil;
    const route = renderHook(() => useMapSocialRouteAdmission(lease), { wrapper }); await act(async () => { await vi.advanceTimersByTimeAsync(10010); });
    expect(route.result.current?.validUntil).toBeGreaterThan(original); expect(currentMapSocialRoute(client, lease, scope(), original + 1)).toBeDefined();
  });
});
