/** Coarse, explicit post areas. Never accept or infer a precise GPS position. */
export type LocalArea = { lat: number; lng: number };
export function isLocalArea(value: unknown): value is LocalArea {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).length === 2 && ['lat', 'lng'].every(key => typeof row[key] === 'number' && Number.isFinite(row[key])
    && Math.abs((row[key] as number) * 10 - Math.round((row[key] as number) * 10)) < 1e-9)
    && Math.abs(row.lat as number) <= 90 && (row.lng as number) >= -180 && (row.lng as number) < 180;
}
export function sameLocalArea(a: unknown, b: unknown): boolean {
  return a == null && b == null || isLocalArea(a) && isLocalArea(b) && a.lat === b.lat && a.lng === b.lng;
}
export function nearbyLocalArea(a: LocalArea, b: LocalArea): boolean {
  const radians = Math.PI / 180;
  const haversine = Math.sin((b.lat - a.lat) * radians / 2) ** 2
    + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin((b.lng - a.lng) * radians / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine)))) <= 40.2336;
}
