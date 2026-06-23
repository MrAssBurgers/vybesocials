import type { LiveFriend } from './types';

/** Linear interpolation between GPS fixes for buttery marker motion. */
export function interpolatePosition(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  t: number,
): { lat: number; lng: number } {
  const clamped = Math.max(0, Math.min(1, t));
  return {
    lat: from.lat + (to.lat - from.lat) * clamped,
    lng: from.lng + (to.lng - from.lng) * clamped,
  };
}

/** Dead-reckoning: project position along heading for brief GPS gaps. */
export function deadReckon(
  lat: number,
  lng: number,
  headingDeg: number,
  speedMps: number,
  deltaSec: number,
): { lat: number; lng: number } {
  const distM = speedMps * deltaSec;
  const R = 6371000;
  const brng = (headingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distM / R) +
      Math.cos(lat1) * Math.sin(distM / R) * Math.cos(brng),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(distM / R) * Math.cos(lat1),
      Math.cos(distM / R) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

export function applyDisplayPositions(
  friends: LiveFriend[],
  progress: number,
): LiveFriend[] {
  return friends.map((f) => {
    const targetLat = f.latitude;
    const targetLng = f.longitude;
    const prevLat = f.displayLat ?? targetLat;
    const prevLng = f.displayLng ?? targetLng;
    const pos = interpolatePosition(
      { lat: prevLat, lng: prevLng },
      { lat: targetLat, lng: targetLng },
      progress,
    );
    return { ...f, displayLat: pos.lat, displayLng: pos.lng };
  });
}
