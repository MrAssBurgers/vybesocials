import { MAPBOX_TOKEN } from './config';
import { isLocalPreview } from '@/lib/firebase/localPreview';

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
): Promise<MapRouteResult | null> {
  if (!MAPBOX_TOKEN || isLocalPreview()) return null;
  const [fromLat, fromLng] = from;
  const [toLat, toLng] = to;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/` +
    `${fromLng},${fromLat};${toLng},${toLat}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as {
      routes?: Array<{ geometry: GeoJSON.LineString; duration: number; distance: number }>;
    };
    const route = data.routes?.[0];
    if (!route?.geometry) return null;
    return {
      geometry: route.geometry,
      durationMinutes: Math.max(1, Math.round(route.duration / 60)),
      distanceMiles: route.distance / 1609.344,
    };
  } catch {
    return null;
  }
}
