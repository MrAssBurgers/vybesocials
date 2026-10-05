import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mapbox = vi.hoisted(() => {
  type Event = { lngLat?: { lat: number; lng: number } };
  class MockMap {
    listeners = new Map<string, Array<{ callback: (event: Event) => void; once: boolean }>>();
    center = { lat: 30.123456, lng: -97.654321 };
    remove = vi.fn();
    addControl = vi.fn();
    constructor(readonly options: Record<string, unknown>) { maps.push(this); }
    on(name: string, callback: (event: Event) => void) { this.listen(name, callback, false); return this; }
    once(name: string, callback: (event: Event) => void) { this.listen(name, callback, true); return this; }
    private listen(name: string, callback: (event: Event) => void, once: boolean) {
      this.listeners.set(name, [...(this.listeners.get(name) || []), { callback, once }]);
    }
    emit(name: string, event: Event = {}) {
      const handlers = this.listeners.get(name) || [];
      this.listeners.set(name, handlers.filter(handler => !handler.once));
      handlers.forEach(handler => handler.callback(event));
    }
    getCenter() { return this.center; }
  }
  class MockMarker {
    coordinates: number[] | undefined;
    calls: string[] = [];
    attachedTo: MockMap | undefined;
    remove = vi.fn();
    constructor() { markers.push(this); }
    setLngLat(coordinates: number[]) { this.coordinates = [...coordinates]; this.calls.push('setLngLat'); return this; }
    addTo(map: MockMap) {
      // Real Mapbox addTo immediately projects the location, so missing coordinates crash.
      if (!this.coordinates) throw new Error('Marker coordinates must be set before addTo');
      this.calls.push('addTo'); this.attachedTo = map; return this;
    }
  }
  const maps: MockMap[] = [], markers: MockMarker[] = [];
  return { Map: MockMap, Marker: MockMarker, NavigationControl: class {}, maps, markers };
});
vi.mock('mapbox-gl', () => ({ default: mapbox }));

import { MapPinAreaPicker } from './MapPinAreaPicker';

async function settleMapImport() { await act(async () => { await vi.dynamicImportSettled(); }); }
beforeEach(() => { mapbox.maps.length = 0; mapbox.markers.length = 0; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('MapPinAreaPicker explicit approximate selection', () => {
  it('waits for map readiness and places the chosen center with coordinates before attachment', async () => {
    const choose = vi.fn();
    render(<MapPinAreaPicker value={null} onChoose={choose} />);
    await settleMapImport();
    const map = mapbox.maps[0];
    const center = screen.getByRole('button', { name: 'Choose map center' });
    expect(center).toBeDisabled();
    fireEvent.click(center);
    act(() => map.emit('click', { lngLat: { lat: 30.1, lng: -97.6 } }));
    expect(choose).not.toHaveBeenCalled();
    expect(mapbox.markers).toHaveLength(0);

    act(() => map.emit('load'));
    expect(center).toBeEnabled();
    fireEvent.click(center);
    expect(choose).toHaveBeenCalledExactlyOnceWith({ latitude: 30.13, longitude: -97.65 });
    expect(mapbox.markers[0].calls).toEqual(['setLngLat', 'addTo']);
    expect(mapbox.markers[0].coordinates).toEqual([-97.65, 30.13]);
    expect(mapbox.markers[0].attachedTo).toBe(map);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the retained area when ready and moves or removes its marker when the draft changes', async () => {
    const choose = vi.fn();
    const view = render(<MapPinAreaPicker value={{ latitude: 30.13, longitude: -97.65, label: 'Chosen area' }} onChoose={choose} />);
    await settleMapImport();
    expect(mapbox.maps[0].options.center).toEqual([-97.65, 30.13]);
    expect(mapbox.markers).toHaveLength(0);
    act(() => mapbox.maps[0].emit('load'));
    expect(mapbox.markers[0].calls).toEqual(['setLngLat', 'addTo']);
    expect(mapbox.markers[0].coordinates).toEqual([-97.65, 30.13]);
    expect(choose).not.toHaveBeenCalled();

    view.rerender(<MapPinAreaPicker value={{ latitude: 40.71, longitude: -74.01, label: 'Revised area' }} onChoose={choose} />);
    expect(mapbox.maps).toHaveLength(1);
    expect(mapbox.markers).toHaveLength(1);
    expect(mapbox.markers[0].coordinates).toEqual([-74.01, 40.71]);
    view.rerender(<MapPinAreaPicker value={null} onChoose={choose} />);
    expect(mapbox.markers[0].remove).toHaveBeenCalledOnce();
    expect(choose).not.toHaveBeenCalled();
  });

  it('normalizes a wrapped globe click and respects disabled changes without replacing the map', async () => {
    const choose = vi.fn();
    const view = render(<MapPinAreaPicker value={null} onChoose={choose} />);
    await settleMapImport();
    const map = mapbox.maps[0];
    act(() => { map.emit('load'); map.emit('click', { lngLat: { lat: 30.123456, lng: 181.12345 } }); });
    expect(choose).toHaveBeenCalledExactlyOnceWith({ latitude: 30.13, longitude: -178.87 });
    expect(mapbox.markers[0].coordinates).toEqual([-178.87, 30.13]);
    view.rerender(<MapPinAreaPicker value={null} onChoose={choose} disabled />);
    expect(screen.getByRole('button', { name: 'Choose map center' })).toBeDisabled();
    act(() => map.emit('click', { lngLat: { lat: 0, lng: 0 } }));
    expect(choose).toHaveBeenCalledTimes(1);
    expect(mapbox.maps).toHaveLength(1);
  });

  it('keeps a timed-out map unavailable until explicit retry and ignores late old callbacks', async () => {
    vi.useFakeTimers();
    const choose = vi.fn();
    render(<MapPinAreaPicker value={null} onChoose={choose} />);
    await settleMapImport();
    const oldMap = mapbox.maps[0];
    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.getByRole('alert')).toHaveTextContent('took too long');
    act(() => { oldMap.emit('load'); oldMap.emit('click', { lngLat: { lat: 0, lng: 0 } }); });
    expect(screen.getByRole('button', { name: 'Choose map center' })).toBeDisabled();
    expect(choose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry map' }));
    await settleMapImport();
    expect(oldMap.remove).toHaveBeenCalledOnce();
    expect(mapbox.maps).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Choose map center' })).toBeDisabled();
    act(() => oldMap.emit('click', { lngLat: { lat: 0, lng: 0 } }));
    expect(choose).not.toHaveBeenCalled();
    act(() => mapbox.maps[1].emit('load'));
    fireEvent.click(screen.getByRole('button', { name: 'Choose map center' }));
    expect(choose).toHaveBeenCalledExactlyOnceWith({ latitude: 30.13, longitude: -97.65 });
    expect(mapbox.markers[0].attachedTo).toBe(mapbox.maps[1]);
  });

  it('removes the map and marker on unmount and rejects subsequent selection callbacks', async () => {
    const choose = vi.fn();
    const view = render(<MapPinAreaPicker value={{ latitude: 30.13, longitude: -97.65, label: 'Area' }} onChoose={choose} />);
    await settleMapImport();
    const map = mapbox.maps[0];
    act(() => map.emit('load'));
    view.unmount();
    expect(map.remove).toHaveBeenCalledOnce();
    expect(mapbox.markers[0].remove).toHaveBeenCalledOnce();
    act(() => map.emit('click', { lngLat: { lat: 0, lng: 0 } }));
    expect(choose).not.toHaveBeenCalled();
  });
});
