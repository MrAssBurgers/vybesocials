import { isLocalPreview } from '@/lib/firebase/localPreview';
import { MAPBOX_TOKEN, hasMapbox } from './config';
import { isValidLatLng } from '../geo';
import { mapProviderJson } from './providerRequest';

export type TeleportResult = { lat: number; lng: number; label: string };
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const label = (value: unknown, query: string) => (typeof value === 'string' && value.trim() ? value : query).split(',')[0].slice(0, 160);

/** A null result means an actual empty search, not an offline or malformed reply. */
export async function resolveTeleportQuery(query: string, signal?: AbortSignal): Promise<TeleportResult | null> {
  const q = query.trim();
  if (!q) return null;
  if (q.length > 240) throw new Error('Use a shorter place or address.');
  if (isLocalPreview()) throw new Error('Place search is unavailable in this local preview. You can still explore the 3D map.');
  if (signal?.aborted) throw new Error('Map request cancelled.');
  let failed = false;
  if (hasMapbox()) {
    try {
      const data = object(await mapProviderJson(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${encodeURIComponent(MAPBOX_TOKEN)}&limit=1&autocomplete=false`, signal,
      ));
      if (!Array.isArray(data?.features)) throw new Error('Invalid map response.');
      const hit = object(data.features[0]);
      if (hit) {
        const center = hit.center;
        if (!Array.isArray(center) || center.length !== 2 || !isValidLatLng(center[1], center[0])) throw new Error('Invalid map coordinates.');
        return { lng: center[0], lat: center[1], label: label(hit.place_name || hit.text, q) };
      }
      if (data.features.length) throw new Error('Invalid map response.');
    } catch { failed = true; }
  }
  // A departed view or newer search must never start a second provider request.
  if (signal?.aborted) throw new Error('Map request cancelled.');
  try {
    const data = await mapProviderJson(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, signal);
    if (!Array.isArray(data)) throw new Error('Invalid map response.');
    if (!data.length) {
      if (failed) throw new Error('The map service is unavailable. Please retry.');
      return null;
    }
    const hit = object(data[0]);
    const lat = typeof hit?.lat === 'string' && hit.lat.trim() ? Number(hit.lat) : NaN;
    const lng = typeof hit?.lon === 'string' && hit.lon.trim() ? Number(hit.lon) : NaN;
    if (!isValidLatLng(lat, lng)) throw new Error('Invalid map coordinates.');
    return { lat, lng, label: label(hit?.display_name, q) };
  } catch {
    if (signal?.aborted) throw new Error('Map request cancelled.');
    throw new Error('Place search could not finish. Please retry.');
  }
}
