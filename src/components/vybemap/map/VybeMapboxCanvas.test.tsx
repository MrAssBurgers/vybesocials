import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ maps: [] as Array<Record<string, any>>, markers: [] as Array<Record<string, any>>, fail: false }));
vi.mock('mapbox-gl', () => ({ default: { accessToken: '', Map: class {
  constructor(options: Record<string, unknown>) {
    if (state.fail) throw new Error('WebGL unavailable');
    const handlers: Record<string, Array<() => void>> = {};
    const active: Record<string, Set<() => void>> = {};
    const sources = new Map<string, any>(), layers = new Map<string, unknown>();
    const map = { options, handlers, sources, layers, remove: vi.fn(), resize: vi.fn(), getZoom: () => options.zoom, getBearing: () => 0,
      getSource: vi.fn((id: string) => sources.get(id)), getLayer: vi.fn((id: string) => layers.get(id)),
      addSource: vi.fn((id: string, value: Record<string, unknown>) => {
        const source = { ...value, setData: vi.fn((data: unknown) => { source.data = data; }) }; sources.set(id, source);
      }), addLayer: vi.fn((value: { id: string }) => layers.set(value.id, value)),
      removeSource: vi.fn((id: string) => sources.delete(id)), removeLayer: vi.fn((id: string) => layers.delete(id)), setTerrain: vi.fn(),
      setStyle: vi.fn(() => { sources.clear(); layers.clear(); }), setPitch: vi.fn(), setProjection: vi.fn(),
      easeTo: vi.fn(), jumpTo: vi.fn(), fitBounds: vi.fn(),
      on: vi.fn((event: string, callback: () => void) => { (handlers[event] ||= []).push(callback); (active[event] ||= new Set()).add(callback); }),
      off: vi.fn((event: string, callback: () => void) => { active[event]?.delete(callback); }),
      emit: (event: string) => active[event]?.forEach(callback => callback()),
    };
    state.maps.push(map); return map;
  }
}, Marker: class {
  constructor(options: { element: HTMLElement }) {
    const marker = { element: options.element, map: null as any, removed: false,
      setLngLat: vi.fn(() => marker), addTo: vi.fn((map: unknown) => { marker.map = map; return marker; }),
      getElement: () => options.element, remove: vi.fn(() => { marker.removed = true; }),
    };
    state.markers.push(marker); return marker;
  }
}, LngLatBounds: class { extend() { return this; } } } }));
vi.mock('@/lib/vybemap/mapbox/config', () => ({ MAPBOX_TOKEN: 'public-fixture-token', MAPBOX_STYLE_URL: { '3d': 'mapbox://styles/mapbox/standard', '2d': 'mapbox://styles/mapbox/streets-v12', satellite: 'mapbox://styles/mapbox/satellite-v9', terrain: 'mapbox://styles/mapbox/outdoors-v12' }, DEFAULT_MAP_CENTER: [-98, 39], pitchForMode: (mode: string) => mode === '3d' ? 52 : 0 }));
vi.mock('@/lib/mediaUrl', () => ({ normalizeMediaUrl: (url: string) => url }));
vi.mock('@/lib/vybemap/deviceHeading', () => ({ subscribeDeviceHeading: () => () => {}, lerpHeading: () => 0 }));
vi.mock('@/lib/despiaBridge', () => ({ getRuntimeOs: () => 'web' }));
import { DEFAULT_LAYERS } from '@/lib/vybemap/types';
import { mapPinFixture } from '@/test/mapPinFixture';
import { VybeMapboxCanvas, type VybeMapboxCanvasProps } from './VybeMapboxCanvas';
const props = { center: null, mapMode: '3d' as const, layers: DEFAULT_LAYERS, friends: [], stories: [], posts: [], clips: [], meetups: [], places: [], eventPins: [], heatmap: [], onFriendTap: vi.fn(), onPlaceTap: vi.fn() };
beforeEach(() => { vi.useFakeTimers(); state.maps.length = 0; state.markers.length = 0; state.fail = false; vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('3D world map remains the requested renderer', () => {
  it('starts Standard globe with original pitch and terrain; ready clears its timeout', () => {
    render(<VybeMapboxCanvas {...props} />);
    expect(state.maps[0].options).toMatchObject({ style: 'mapbox://styles/mapbox/standard', projection: { name: 'globe' }, pitch: 52 });
    act(() => state.maps[0].handlers['style.load'].forEach(fn => fn()));
    expect(state.maps[0].setTerrain).toHaveBeenCalledWith({ source: 'mapbox-dem', exaggeration: 1.4 });
    expect(screen.queryByRole('status')).toBeNull();
    act(() => vi.advanceTimersByTime(21000)); expect(screen.queryByRole('alert')).toBeNull();
  });
  it('does not flatten on failure; retry tears down the old renderer and ignores its late events', () => {
    const fallback = vi.fn(); render(<VybeMapboxCanvas {...props} onUseFlatFallback={fallback} />);
    act(() => state.maps[0].handlers.error.forEach(fn => fn()));
    expect(state.maps[0].setStyle).not.toHaveBeenCalled(); expect(fallback).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry 3D map' }));
    expect(state.maps[0].remove).toHaveBeenCalledOnce(); expect(state.maps).toHaveLength(2);
    act(() => state.maps[0].handlers['style.load'].forEach(fn => fn()));
    expect(screen.getByRole('status')).toHaveTextContent('Loading 3D');
    act(() => state.maps[1].handlers.error.forEach(fn => fn()));
    fireEvent.click(screen.getByRole('button', { name: 'Use flat map instead' })); expect(fallback).toHaveBeenCalledOnce();
  });
  it('gives an actionable bounded loading timeout', () => {
    render(<VybeMapboxCanvas {...props} />); act(() => vi.advanceTimersByTime(20000));
    expect(screen.getByRole('alert')).toHaveTextContent('taking too long'); expect(screen.getByRole('button', { name: 'Retry 3D map' })).toBeVisible();
  });
  it('handles unavailable WebGL without crashing the map route', () => {
    state.fail = true; render(<VybeMapboxCanvas {...props} />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not start');
    state.fail = false; fireEvent.click(screen.getByRole('button', { name: 'Retry 3D map' }));
    expect(state.maps).toHaveLength(1); expect(screen.queryByRole('alert')).toBeNull();
  });
  it('reconciles a new mode before initial load and ignores the old captured style callback', () => {
    const ready = vi.fn();
    const view = render(<VybeMapboxCanvas {...props} onMapReady={ready} />);
    const map = state.maps[0], oldLoad = map.handlers['style.load'][0];
    view.rerender(<VybeMapboxCanvas {...props} mapMode="satellite" onMapReady={ready} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading map');
    expect(screen.getByRole('status')).not.toHaveTextContent('3D');
    expect(map.setStyle).toHaveBeenCalledExactlyOnceWith('mapbox://styles/mapbox/satellite-v9');
    act(oldLoad); expect(screen.getByRole('status')).toBeInTheDocument();
    expect(map.setTerrain).not.toHaveBeenCalled(); expect(ready).not.toHaveBeenCalledWith(map);
    act(() => map.emit('style.load'));
    expect(map.setProjection).toHaveBeenLastCalledWith({ name: 'mercator' });
    expect(map.setPitch).toHaveBeenLastCalledWith(0); expect(ready).toHaveBeenLastCalledWith(map);
  });
  it('rehydrates unchanged markers, self position, route, heatmap and pins after initial load, style changes and retry', () => {
    const populated = {
      ...props, center: [30, -97], layers: { ...DEFAULT_LAYERS, friends: true, trending: true, meetups: true, heatmap: true, posts: true },
      friends: [{ user_id: 'bob', latitude: 30.1, longitude: -97.1, profile: { username: 'Bob' } }],
      places: [{ id: 'place', name: 'Park', latitude: 30.2, longitude: -97.2, check_in_count: 1 }],
      meetups: [{ id: 'meet', title: 'Walk', dest_latitude: 30.3, dest_longitude: -97.3 }],
      heatmap: [{ cell_latitude: 30.4, cell_longitude: -97.4, intensity: 20 }],
      posts: [mapPinFixture({ latitude: 30.5, longitude: -97.5 })], onContentTap: vi.fn(),
      routeGeometry: { type: 'LineString', coordinates: [[-97, 30], [-97.5, 30.5]] }, onMeetupTap: vi.fn(),
    } as unknown as VybeMapboxCanvasProps;
    const ready = vi.fn(); const view = render(<VybeMapboxCanvas {...populated} onMapReady={ready} />);
    const map = state.maps[0]; expect(state.markers).toHaveLength(0);
    const assertHydrated = (target: Record<string, any>) => {
      expect(state.markers.filter(marker => marker.map === target && !marker.removed)).toHaveLength(5);
      expect(target.sources.get('vybe-route').data.geometry).toEqual(populated.routeGeometry);
      expect(target.sources.get('vybe-heatmap').data.features).toHaveLength(1);
      expect(state.markers.filter(marker => marker.map === target && !marker.removed).some(marker => marker.element.querySelector('button[aria-label="Open post by Alice · Chicago · approximate area"]'))).toBe(true);
      expect(target.layers.has('vybe-route-line')).toBe(true);
    };
    act(() => map.emit('style.load')); assertHydrated(map);
    view.rerender(<VybeMapboxCanvas {...populated} mapMode="satellite" onMapReady={ready} />);
    expect(ready).toHaveBeenLastCalledWith(null); expect(map.sources.size).toBe(0);
    expect(state.markers.filter(marker => !marker.removed)).toHaveLength(0);
    act(() => map.emit('style.load')); assertHydrated(map);
    // Retry a timed-out replacement using precisely the same center/data refs.
    view.rerender(<VybeMapboxCanvas {...populated} mapMode="terrain" onMapReady={ready} />);
    act(() => vi.advanceTimersByTime(20000)); fireEvent.click(screen.getByRole('button', { name: 'Retry map', exact: true }));
    expect(map.remove).toHaveBeenCalledOnce(); expect(ready).toHaveBeenLastCalledWith(null);
    act(() => state.maps[1].emit('style.load')); assertHydrated(state.maps[1]);
  });
  it('cancels rapid old-mode callbacks/timeouts, and late optional errors do not cover a ready map', () => {
    const view = render(<VybeMapboxCanvas {...props} />); const map = state.maps[0];
    act(() => map.emit('style.load'));
    view.rerender(<VybeMapboxCanvas {...props} mapMode="satellite" />);
    const oldLoad = map.handlers['style.load'].at(-1), oldError = map.handlers.error.at(-1);
    act(() => vi.advanceTimersByTime(15000));
    view.rerender(<VybeMapboxCanvas {...props} mapMode="3d" />);
    act(() => { oldLoad(); oldError(); vi.advanceTimersByTime(6000); });
    expect(screen.getByRole('status')).toBeInTheDocument(); expect(screen.queryByRole('alert')).toBeNull();
    act(() => map.emit('style.load')); expect(map.setProjection).toHaveBeenLastCalledWith({ name: 'globe' });
    act(() => { map.emit('error'); vi.advanceTimersByTime(21000); });
    expect(screen.queryByRole('alert')).toBeNull();
    const currentLoad = map.handlers['style.load'].at(-1); view.unmount(); map.setProjection.mockClear();
    act(currentLoad); expect(map.setProjection).not.toHaveBeenCalled();
  });
  it('does not strand GPS follow when a style change cancels a recent gesture pause', () => {
    const view = render(<VybeMapboxCanvas {...props} center={[30, -97]} />); const map = state.maps[0];
    act(() => map.emit('style.load'));
    act(() => map.handlers.dragstart.at(-1)({ originalEvent: {} }));
    view.rerender(<VybeMapboxCanvas {...props} center={[30, -97]} mapMode="satellite" />);
    act(() => map.emit('style.load')); map.easeTo.mockClear();
    // A style change must not itself resume following after the user's pan.
    view.rerender(<VybeMapboxCanvas {...props} center={[30.1, -97.1]} mapMode="satellite" />);
    expect(map.easeTo).not.toHaveBeenCalled();
    act(() => map.emit('vybe:resume-follow'));
    view.rerender(<VybeMapboxCanvas {...props} center={[30.2, -97.2]} mapMode="satellite" />);
    expect(map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [-97.2, 30.2] }));
  });
  it('updates admitted marker callbacks and removes buttons when their layer or admission ends', () => {
    const pin = mapPinFixture(), clip = mapPinFixture({ id: 'd'.repeat(64), sourceType: 'short', kind: 'clip' }), open = vi.fn();
    const content = { ...props, layers: { ...DEFAULT_LAYERS, posts: true, clips: true }, posts: [pin], clips: [clip], onContentTap: open };
    const view = render(<VybeMapboxCanvas {...content} />); act(() => state.maps[0].emit('style.load'));
    const markers = state.markers.filter(marker => !marker.removed);
    expect(markers).toHaveLength(2); const button = markers[0].element.querySelector('button');
    fireEvent.click(button); expect(open).toHaveBeenLastCalledWith(pin);
    const updated = { ...pin, areaLabel: 'Updated area', revision: 'e'.repeat(48) };
    view.rerender(<VybeMapboxCanvas {...content} posts={[updated]} />);
    fireEvent.click(button); expect(open).toHaveBeenLastCalledWith(updated); expect(state.markers).toHaveLength(2);
    view.rerender(<VybeMapboxCanvas {...content} layers={{ ...content.layers, posts: false }} clips={[]} />);
    expect(markers.every(marker => marker.removed)).toBe(true); fireEvent.click(button); expect(open).toHaveBeenCalledTimes(2);
  });
});
