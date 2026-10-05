import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type mapboxgl from 'mapbox-gl';
import { type MapViewMode, pitchForMode } from '@/lib/vybemap/mapbox/config';
import { useVybeMapFlyTo } from './useVybeMapFlyTo';

function camera() {
  return { fire: vi.fn(), easeTo: vi.fn(), jumpTo: vi.fn(), getCenter: () => ({ toArray: () => [-97, 30] }), getZoom: () => 15 };
}

describe('map camera controls keep the selected map look', () => {
  it.each<MapViewMode>(['3d', '2d', 'satellite', 'terrain', 'hybrid'])('keeps %s pitch while wandering, resetting north and recentering', mode => {
    const map = camera();
    const { result } = renderHook(() => useVybeMapFlyTo(mode));
    act(() => result.current.setMap(map as unknown as mapboxgl.Map));
    act(() => result.current.startWander());
    expect(map.fire).toHaveBeenLastCalledWith('vybe:pause-follow');
    expect(map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [-97, 30], zoom: 12.5, pitch: pitchForMode(mode) }));
    act(() => result.current.resetBearing());
    expect(map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ bearing: 0, pitch: pitchForMode(mode) }));
    act(() => result.current.flyToUser(31, -98));
    expect(map.fire).toHaveBeenLastCalledWith('vybe:resume-follow');
    expect(map.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [-98, 31], pitch: pitchForMode(mode) }));
  });

  it('uses the latest selection and never sends controls to a renderer being replaced', () => {
    const oldMap = camera(), newMap = camera();
    const { result, rerender } = renderHook(({ mode }: { mode: MapViewMode }) => useVybeMapFlyTo(mode), { initialProps: { mode: '3d' as MapViewMode } });
    act(() => result.current.setMap(oldMap as unknown as mapboxgl.Map));
    rerender({ mode: 'terrain' });
    act(() => result.current.resetBearing());
    expect(oldMap.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ pitch: 42 }));
    act(() => result.current.setMap(null));
    oldMap.easeTo.mockClear();
    act(() => { result.current.flyToUser(1, 2); result.current.startWander(); result.current.resetBearing(); });
    expect(oldMap.easeTo).not.toHaveBeenCalled();
    rerender({ mode: '3d' });
    act(() => result.current.setMap(newMap as unknown as mapboxgl.Map));
    act(() => result.current.flyToUser(1, 2));
    expect(newMap.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ pitch: 52 }));
  });
});
