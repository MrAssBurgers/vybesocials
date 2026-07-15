/**
 * FriendLink "Nearby" fallback — AirDrop-style discovery for phones without NFC
 * (or when NFC isn't working).
 *
 * Each phone publishes a short-lived presence doc (keyed by profile id) into
 * the `friend_link_nearby` Firestore collection, tagged with a coarse ~165m
 * location cell. Everyone in the same or an adjacent cell sees each other in
 * realtime and can tap an avatar bubble to run the normal FriendLink
 * handshake — no Bluetooth pairing, works on every device.
 */

import { despiaCall, isDespiaRuntime } from '@/lib/despiaBridge';

export const NEARBY_HEARTBEAT_MS = 20_000;
/** Presence docs older than this are considered gone (missed 2+ heartbeats). */
export const NEARBY_STALE_MS = 65_000;
/** Poll peers even if realtime bootstrap skips the first snapshot. */
export const NEARBY_PEER_POLL_MS = 3_000;

/** ~165m grid cells (0.0015° latitude ≈ 167m; longitude shrinks toward poles). */
const CELL_DEG = 0.0015;

export interface NearbyPresence {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  cell: string;
  updated_at: string;
  expires_at: string;
}

function cellId(latIdx: number, lngIdx: number): string {
  return `${latIdx}:${lngIdx}`;
}

export function nearbyCellForPosition(lat: number, lng: number): string {
  return cellId(Math.floor(lat / CELL_DEG), Math.floor(lng / CELL_DEG));
}

/** Own cell + 8 neighbors, so phones straddling a cell border still match. */
export function nearbyCellsAround(lat: number, lng: number): string[] {
  const latIdx = Math.floor(lat / CELL_DEG);
  const lngIdx = Math.floor(lng / CELL_DEG);
  const cells: string[] = [];
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLng = -1; dLng <= 1; dLng++) {
      cells.push(cellId(latIdx + dLat, lngIdx + dLng));
    }
  }
  return cells;
}

export function isPresenceFresh(presence: Pick<NearbyPresence, 'updated_at'>, now = Date.now()): boolean {
  const updated = Date.parse(presence.updated_at || '');
  return Number.isFinite(updated) && now - updated < NEARBY_STALE_MS;
}

export type NearbyPositionError = 'denied' | 'unavailable' | 'error';

export async function getCoarsePosition(
  timeoutMs = 12_000,
): Promise<{ lat: number; lng: number } | { error: NearbyPositionError }> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { error: 'unavailable' };
  }

  // Despia WKWebView: arm native GPS so navigator.geolocation can resolve.
  if (isDespiaRuntime()) {
    try {
      void despiaCall('backgroundlocationon://');
    } catch {
      /* ignore */
    }
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        resolve({ error: err.code === err.PERMISSION_DENIED ? 'denied' : 'error' });
      },
      {
        enableHighAccuracy: isDespiaRuntime(),
        timeout: timeoutMs,
        maximumAge: isDespiaRuntime() ? 15_000 : 120_000,
      },
    );
  });
}

/** Call when Friend Link Nearby session ends (pairs with backgroundlocationon). */
export function stopFriendLinkNativeGps(): void {
  if (!isDespiaRuntime()) return;
  try {
    void despiaCall('backgroundlocationoff://');
  } catch {
    /* ignore */
  }
}
