import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ local: false, mapbox: true }));
vi.mock('@/lib/firebase/localPreview', () => ({ isLocalPreview: () => state.local }));
vi.mock('./config', () => ({ MAPBOX_TOKEN: 'test-public-token', hasMapbox: () => state.mapbox }));
import { resolveTeleportQuery } from './geocode';
import { fetchMapboxRoute } from './directions';
import { mapProviderJson } from './providerRequest';
const fetchMock = vi.fn();
const response = (data: unknown) => ({ ok: true, json: async () => data });
const geometry = { type: 'LineString', coordinates: [[-87, 40], [-86, 41]] };
beforeEach(() => { state.local = false; state.mapbox = true; vi.clearAllMocks(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('bounded map provider requests', () => {
  it('bounds ignored network aborts and stalled JSON decoding', async () => {
    vi.useFakeTimers();
    for (const result of [new Promise(() => {}), Promise.resolve({ ok: true, json: () => new Promise(() => {}) })]) {
      fetchMock.mockReturnValueOnce(result); const task = mapProviderJson('https://test.invalid'); const failure = expect(task).rejects.toThrow(/too long/);
      await vi.advanceTimersByTimeAsync(6_000); await failure; expect(fetchMock.mock.lastCall?.[1].signal.aborted).toBe(true);
    }
  });
  it('does not fetch when already cancelled and cancels an ongoing request', async () => {
    const before = new AbortController(); before.abort(); await expect(mapProviderJson('https://test.invalid', before.signal)).rejects.toThrow(/cancelled/); expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockReturnValue(new Promise(() => {})); const active = new AbortController(); const task = mapProviderJson('https://test.invalid', active.signal); const failure = expect(task).rejects.toThrow(/cancelled/); active.abort(); await failure;
  });
});
describe('place lookup', () => {
  it('accepts validated coordinates, encodes queries, and uses a concise label', async () => {
    fetchMock.mockResolvedValue(response({ features: [{ center: [-87, 40], place_name: 'Chicago, Illinois' }] }));
    expect(await resolveTeleportQuery('  Chicago & park  ')).toEqual({ lat: 40, lng: -87, label: 'Chicago' });
    expect(fetchMock.mock.calls[0][0]).toContain('Chicago%20%26%20park'); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('falls back after provider failure and accepts zero coordinates', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response([{ lat: '0', lon: '0', display_name: 'Gulf, Ocean' }]));
    expect(await resolveTeleportQuery('Gulf')).toEqual({ lat: 0, lng: 0, label: 'Gulf' });
  });
  it('distinguishes empty replies from failed or malformed providers', async () => {
    fetchMock.mockResolvedValueOnce(response({ features: [] })).mockResolvedValueOnce(response([])); expect(await resolveTeleportQuery('missing')).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response([])); await expect(resolveTeleportQuery('retry')).rejects.toThrow(/could not finish/);
    fetchMock.mockResolvedValueOnce(response({ features: [{ center: [NaN, 40] }] })).mockResolvedValueOnce(response([{ lat: '5x', lon: '0' }])); await expect(resolveTeleportQuery('invalid')).rejects.toThrow(/could not finish/);
  });
  it('does not start fallback after view cancellation', async () => {
    fetchMock.mockReturnValue(new Promise(() => {})); const controller = new AbortController(); const task = resolveTeleportQuery('place', controller.signal); const failure = expect(task).rejects.toThrow(/cancelled/); controller.abort(); await failure; expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('keeps local QA provider-free and rejects oversized queries', async () => {
    await expect(resolveTeleportQuery('x'.repeat(241))).rejects.toThrow(/shorter/); state.local = true;
    await expect(resolveTeleportQuery('Chicago')).rejects.toThrow(/local preview/); expect(fetchMock).not.toHaveBeenCalled();
  });
});
describe('route replies', () => {
  it('returns only a valid route with finite distances', async () => {
    fetchMock.mockResolvedValue(response({ routes: [{ geometry, duration: 130, distance: 1609.344 }] }));
    expect(await fetchMapboxRoute([40, -87], [41, -86])).toEqual({ geometry, durationMinutes: 2, distanceMiles: 1 });
  });
  it.each([{ ...geometry, coordinates: [] }, { ...geometry, coordinates: [[-87, 40], [0, 100]] }, { type: 'Point', coordinates: [-87, 40] }])('rejects invalid route geometry', async invalid => {
    fetchMock.mockResolvedValue(response({ routes: [{ geometry: invalid, duration: 30, distance: 100 }] })); expect(await fetchMapboxRoute([40, -87], [41, -86])).toBeNull();
  });
  it('rejects invalid inputs, metrics, timeout and ignores a late route', async () => {
    expect(await fetchMapboxRoute([NaN, -87], [41, -86])).toBeNull(); expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(response({ routes: [{ geometry, duration: NaN, distance: 100 }] })); expect(await fetchMapboxRoute([40, -87], [41, -86])).toBeNull();
    vi.useFakeTimers(); fetchMock.mockReturnValueOnce(new Promise(() => {})); const task = fetchMapboxRoute([40, -87], [41, -86]); await vi.advanceTimersByTimeAsync(10_000); expect(await task).toBeNull();
  });
});
