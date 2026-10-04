export type LocalArea = { lat: number; lng: number };
/** Round before any network request. +180 and -180 describe the same meridian. */
export function approximateLocalArea(lat: number, lng: number): LocalArea {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Your location could not be read. Try again.');
  const roundedLng = Math.round(lng * 10) / 10;
  return { lat: Math.round(lat * 10) / 10 || 0, lng: roundedLng === 180 ? -180 : roundedLng || 0 };
}
export function validLocalArea(value: unknown): value is LocalArea {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as LocalArea;
  try { const rounded = approximateLocalArea(row.lat, row.lng); return Object.keys(value).length === 2 && rounded.lat === row.lat && rounded.lng === row.lng; } catch { return false; }
}
