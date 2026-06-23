import type { LiveFriend } from './types';
import { bearingDegrees, distanceMeters } from './geo';

/** True when a moving friend is likely heading toward you (Snap doesn't show this). */
export function isHeadingTowardYou(
  friend: LiveFriend,
  myCoords: [number, number] | null,
): boolean {
  if (!myCoords) return false;
  const lat = friend.displayLat ?? friend.latitude;
  const lng = friend.displayLng ?? friend.longitude;
  const speed = friend.speed ?? 0;
  const heading = friend.heading;
  if (speed < 0.4 || heading == null || !Number.isFinite(heading)) return false;

  const distM = distanceMeters([lat, lng], myCoords);
  if (distM < 60 || distM > 25_000) return false;

  const bearingToMe = bearingDegrees([lat, lng], myCoords);
  const diff = Math.abs(((bearingToMe - heading + 540) % 360) - 180);
  return diff < 50;
}
