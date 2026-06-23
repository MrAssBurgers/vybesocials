/** External turn-by-turn URL (fallback when Mapbox unavailable). */
export function externalDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
