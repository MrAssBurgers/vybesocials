/** Mapbox access token — get one at https://account.mapbox.com/access-tokens/ */
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;

export function hasMapbox(): boolean {
  return typeof MAPBOX_TOKEN === 'string' && MAPBOX_TOKEN.length > 10;
}

export type MapViewMode = '2d' | '3d' | 'satellite' | 'terrain' | 'hybrid';

export const MAP_VIEW_MODES: { id: MapViewMode; label: string; icon: string }[] = [
  { id: '2d', label: '2D', icon: '🗺️' },
  { id: '3d', label: '3D', icon: '🏙️' },
  { id: 'satellite', label: 'Satellite', icon: '🛰️' },
  { id: 'terrain', label: 'Terrain', icon: '⛰️' },
  { id: 'hybrid', label: 'Hybrid', icon: '🌐' },
];

export const MAPBOX_STYLE_URL: Record<MapViewMode, string> = {
  '2d': 'mapbox://styles/mapbox/dark-v11',
  '3d': 'mapbox://styles/mapbox/standard',
  satellite: 'mapbox://styles/mapbox/satellite-v9',
  terrain: 'mapbox://styles/mapbox/outdoors-v12',
  hybrid: 'mapbox://styles/mapbox/satellite-streets-v12',
};

export const DEFAULT_MAP_CENTER: [number, number] = [-98.5795, 39.8283];

export function pitchForMode(mode: MapViewMode): number {
  if (mode === '3d') return 58;
  if (mode === 'terrain') return 45;
  return 0;
}
