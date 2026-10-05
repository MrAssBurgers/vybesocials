/** Mapbox access token — get one at https://account.mapbox.com/access-tokens/ */
const ENV_TOKEN = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined)?.trim();

/**
 * Public Mapbox client token (pk.*) — safe in client bundles when URL-restricted
 * in the Mapbox dashboard (vybehub.app, *.web.app, localhost).
 * Used when Lovable/production build omits VITE_MAPBOX_ACCESS_TOKEN.
 */
const VYBEMAP_PUBLIC_TOKEN =
  'pk.eyJ1IjoidnliZXNvY2lhbCIsImEiOiJjbXFyM2Zxam0wcDJzMzJuNGpmczl2bWJvIn0.RTc6z6ye6ZqBtvgMs6Wptg';

function resolveMapboxToken(): string {
  if (ENV_TOKEN && ENV_TOKEN.length > 10) return ENV_TOKEN;
  return VYBEMAP_PUBLIC_TOKEN;
}

export const MAPBOX_TOKEN = resolveMapboxToken();

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
  '2d': 'mapbox://styles/mapbox/streets-v12',
  '3d': 'mapbox://styles/mapbox/standard',
  satellite: 'mapbox://styles/mapbox/satellite-v9',
  terrain: 'mapbox://styles/mapbox/outdoors-v12',
  hybrid: 'mapbox://styles/mapbox/satellite-streets-v12',
};

export const DEFAULT_MAP_CENTER: [number, number] = [-98.5795, 39.8283];

export function pitchForMode(mode: MapViewMode): number {
  if (mode === '3d') return 52;
  if (mode === 'terrain') return 42;
  return 0;
}

const MAP_VIEW_MODES_SET = new Set<MapViewMode>(MAP_VIEW_MODES.map((m) => m.id));

export const MAP_VIEW_MODE_STORAGE_KEY = 'vybe-map-view-mode-v1';

export function isMapViewMode(value: unknown): value is MapViewMode {
  return typeof value === 'string' && MAP_VIEW_MODES_SET.has(value as MapViewMode);
}

export function readStoredMapViewMode(): MapViewMode {
  try {
    const raw = localStorage.getItem(MAP_VIEW_MODE_STORAGE_KEY);
    if (isMapViewMode(raw)) return raw;
  } catch { /* ignore */ }
  return '3d';
}

export function persistMapViewMode(mode: MapViewMode): void {
  try {
    localStorage.setItem(MAP_VIEW_MODE_STORAGE_KEY, mode);
  } catch { /* ignore */ }
}
