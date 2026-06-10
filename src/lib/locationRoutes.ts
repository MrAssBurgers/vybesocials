/** Routes where geolocation may be requested (map + local feed tab only). */
export function isMapRoute(pathname: string): boolean {
  return pathname === '/map' || pathname.startsWith('/map/');
}
