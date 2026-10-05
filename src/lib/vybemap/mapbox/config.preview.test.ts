import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ local: true }));
vi.mock('@/lib/firebase/localPreview', () => ({ isLocalPreview: () => state.local }));
beforeEach(() => { vi.resetModules(); state.local = true; localStorage.clear(); }); afterEach(() => { vi.unstubAllGlobals(); });
describe('map preview renderer isolation', () => {
  it('retains the 3D renderer while unrelated search/directions stay isolated in local QA', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const config = await import('./config'); expect(config.hasMapbox()).toBe(true); expect(config.MAPBOX_TOKEN.startsWith('pk.')).toBe(true);
    expect(config.readStoredMapViewMode()).toBe('3d'); expect(config.pitchForMode('3d')).toBe(52);
    const { resolveTeleportQuery } = await import('./geocode'), { fetchMapboxRoute } = await import('./directions');
    expect(await resolveTeleportQuery('Austin')).toBeNull(); expect(await fetchMapboxRoute([1, 2], [3, 4])).toBeNull(); expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves configured production Mapbox availability', async () => {
    state.local = false; const config = await import('./config'); expect(config.hasMapbox()).toBe(true); expect(config.MAPBOX_TOKEN.startsWith('pk.')).toBe(true);
  });
  it('preserves an explicitly selected map mode', async () => {
    const config = await import('./config'); config.persistMapViewMode('satellite');
    expect(config.readStoredMapViewMode()).toBe('satellite');
    config.persistMapViewMode('2d'); expect(config.readStoredMapViewMode()).toBe('2d');
  });
});
