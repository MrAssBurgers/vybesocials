import { useRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ maps: [] as Array<Record<string, any>>, tiles: [] as Array<Record<string, any>>, icons: [] as Array<unknown>, disconnect: vi.fn() }));
vi.mock('leaflet', () => ({ default: {
  map: vi.fn(() => { const map = { setView: vi.fn(() => map), remove: vi.fn(), invalidateSize: vi.fn() }; state.maps.push(map); return map; }),
  tileLayer: vi.fn((url, options) => { const handlers: Record<string, () => void> = {}; const tile = { url, options, handlers, on: vi.fn((event, handler) => { handlers[event] = handler; return tile; }), addTo: vi.fn(() => tile), off: vi.fn() }; state.tiles.push(tile); return tile; }),
  layerGroup: () => ({ addTo: () => ({ clearLayers: vi.fn() }) }),
  divIcon: (input: unknown) => { state.icons.push(input); return input; },
  marker: () => ({ addTo: () => ({ on: vi.fn() }) }), circleMarker: () => ({ addTo: vi.fn() }), circle: () => ({ addTo: vi.fn() }), DomEvent: { stopPropagation: vi.fn() },
} }));
import { DEFAULT_LAYERS } from '@/lib/vybemap/types';
import { FALLBACK_TILES, VybeMapLeafletFallback } from './VybeMapLeafletFallback';
function Host({ friends = [], onMapReady }: { friends?: any[]; onMapReady?: (map: any) => void }) { const ref = useRef<HTMLDivElement>(null); return <><div ref={ref} /><VybeMapLeafletFallback center={null} layers={DEFAULT_LAYERS} friends={friends} stories={[]} posts={[]} clips={[]} meetups={[]} places={[]} eventPins={[]} heatmap={[]} onFriendTap={() => {}} onPlaceTap={() => {}} mapElRef={ref} onMapReady={onMapReady} /></>; }
beforeEach(() => { vi.useFakeTimers(); state.maps.length = 0; state.tiles.length = 0; state.icons.length = 0; vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = state.disconnect; }); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('keyless map tile lifecycle', () => {
  it('retires the parent camera reference when returning to the globe', () => {
    const ready = vi.fn(), latestReady = vi.fn();
    const view = render(<Host onMapReady={ready} />);
    expect(ready).toHaveBeenLastCalledWith(state.maps[0]);
    view.rerender(<Host onMapReady={latestReady} />);
    view.unmount();
    expect(latestReady).toHaveBeenLastCalledWith(null);
    expect(state.maps[0].remove).toHaveBeenCalledOnce();
    act(() => state.tiles[0].handlers.tileload());
    expect(latestReady).toHaveBeenCalledOnce();
  });
  it('loads only viewport OpenStreetMap tiles with normal browser caching and a referrer', () => {
    render(<Host />); expect(screen.getByRole('status')).toHaveTextContent('Loading map');
    expect(state.tiles[0].url).toBe(FALLBACK_TILES);
    expect(state.tiles[0].url).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(state.tiles[0].options).toMatchObject({ keepBuffer: 0, updateWhenIdle: true, updateWhenZooming: false, detectRetina: false, referrerPolicy: 'strict-origin-when-cross-origin' });
    expect(state.tiles[0].options.subdomains).toBeUndefined();
    act(() => state.tiles[0].handlers.tileload()); expect(screen.queryByRole('status')).toBeNull();
    act(() => vi.advanceTimersByTime(16000)); expect(screen.queryByRole('alert')).toBeNull();
  });
  it('gives a bounded retry after missing tiles and tears down the old map and listeners', () => {
    render(<Host />); act(() => vi.advanceTimersByTime(15000)); expect(screen.getByRole('alert')).toHaveTextContent('could not load');
    fireEvent.click(screen.getByRole('button', { name: 'Retry map' })); expect(state.maps[0].remove).toHaveBeenCalledOnce(); expect(state.tiles[0].off).toHaveBeenCalledOnce(); expect(state.maps).toHaveLength(2);
    act(() => state.tiles[0].handlers.tileload()); expect(screen.getByRole('status')).toHaveTextContent('Loading map');
    act(() => state.tiles[1].handlers.tileload()); expect(screen.queryByRole('status')).toBeNull();
  });
  it('treats user avatar strings as DOM image data, never marker markup', () => {
    render(<Host friends={[{ id: 'a', user_id: 'a', latitude: 1, longitude: 2, profile: { avatar_url: 'x" onload="evil()' } }]} />);
    const html = (state.icons[0] as { html: HTMLElement }).html; expect(html).toBeInstanceOf(HTMLElement);
    expect(html.querySelector('img')?.getAttribute('onload')).toBeNull(); expect(html.querySelector('script')).toBeNull();
  });
});
