import { isLocalPreview } from '@/lib/firebase/localPreview';
/**
 * Place search for VybeMap Teleport — prefer Mapbox Geocoding (fast), fall back to Nominatim.
 */

import { MAPBOX_TOKEN, hasMapbox } from '@/lib/vybemap/mapbox/config';

export type TeleportResult = {
  lat: number;
  lng: number;
  label: string;
};

type MapboxFeature = {
  place_name?: string;
  text?: string;
  center?: [number, number];
};

type NominatimHit = {
  lat?: string;
  lon?: string;
  display_name?: string;
};

export async function resolveTeleportQuery(query: string): Promise<TeleportResult | null> {
  const q = query.trim();
  if (!q || isLocalPreview()) return null;

  if (hasMapbox()) {
    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
        `?access_token=${encodeURIComponent(MAPBOX_TOKEN)}&limit=1&autocomplete=true`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as { features?: MapboxFeature[] };
        const hit = data.features?.[0];
        if (hit?.center && hit.center.length >= 2) {
          return {
            lng: hit.center[0],
            lat: hit.center[1],
            label: (hit.place_name || hit.text || q).split(',')[0],
          };
        }
      }
    } catch {
      /* fall through */
    }
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimHit[];
    const hit = data?.[0];
    if (!hit?.lat || !hit?.lon) return null;
    return {
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      label: (hit.display_name || q).split(',')[0],
    };
  } catch {
    return null;
  }
}
