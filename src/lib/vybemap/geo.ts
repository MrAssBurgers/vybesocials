const R_MI = 3958.8;
const R_FT = R_MI * 5280;
const R_M = 6371000;

export function distanceMiles(a: [number, number], b: [number, number]): number {
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.sqrt(h));
}

export function distanceFeet(a: [number, number], b: [number, number]): number {
  return distanceMiles(a, b) * 5280;
}

export function distanceMeters(a: [number, number], b: [number, number]): number {
  return distanceMiles(a, b) * 1609.344;
}

export function bearingDegrees(from: [number, number], to: [number, number]): number {
  const lat1 = (from[0] * Math.PI) / 180;
  const lat2 = (to[0] * Math.PI) / 180;
  const dLng = ((to[1] - from[1]) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function formatDistance(feet: number): string {
  if (feet < 528) return `${Math.round(feet)} FT`;
  const mi = feet / 5280;
  if (mi < 10) return `${mi.toFixed(1)} MI`;
  return `${Math.round(mi)} MI`;
}

export function proximityColor(feet: number): string {
  if (feet < 150) return '#22c55e';
  if (feet < 800) return '#eab308';
  return '#ef4444';
}

export function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Jitter coords for approximate sharing (~200m). */
export function approximateCoords(lat: number, lng: number, seed: string): { lat: number; lng: number } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const angle = ((h % 360) * Math.PI) / 180;
  const dist = 0.0015 + (h % 1000) / 1_000_000;
  return {
    lat: lat + Math.cos(angle) * dist,
    lng: lng + Math.sin(angle) * dist,
  };
}
