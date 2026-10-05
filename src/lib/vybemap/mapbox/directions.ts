import { MAPBOX_TOKEN } from './config';
import { isLocalPreview } from '@/lib/firebase/localPreview';
import { isValidLatLng } from '../geo';
import { mapProviderJson } from './providerRequest';

export interface MapRouteResult {
  geometry: GeoJSON.LineString;
  durationMinutes: number;
  distanceMiles: number;
}

/** Walking/driving route + ETA via Mapbox Directions API. */
export async function fetchMapboxRoute(
  from: [number, number],
  to: [number, number],
  profile: 'walking' | 'driving' = 'walking',
  signal?: AbortSignal,
): Promise<MapRouteResult | null> {
  if (!MAPBOX_TOKEN || isLocalPreview() || signal?.aborted || !isValidLatLng(...from) || !isValidLatLng(...to) || !['walking', 'driving'].includes(profile)) return null;
  const [fromLat, fromLng] = from;
  const [toLat, toLng] = to;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/` +
    `${fromLng},${fromLat};${toLng},${toLat}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;

  try {
    const data = await mapProviderJson(url, signal, 10_000) as {
      routes?: Array<{ geometry: GeoJSON.LineString; duration: number; distance: number }>;
    };
    const route = data?.routes?.[0];
    if (signal?.aborted || !route?.geometry || route.geometry.type !== 'LineString' || !Array.isArray(route.geometry.coordinates)
      || route.geometry.coordinates.length < 2 || route.geometry.coordinates.length > 50_000
      || !route.geometry.coordinates.every(point => Array.isArray(point) && point.length >= 2 && isValidLatLng(point[1], point[0]))
      || !Number.isFinite(route.duration) || route.duration < 0 || !Number.isFinite(route.distance) || route.distance < 0) return null;
    return {
      geometry: route.geometry,
      durationMinutes: Math.max(1, Math.round(route.duration / 60)),
      distanceMiles: route.distance / 1609.344,
    };
  } catch {
    return null;
  }
}
