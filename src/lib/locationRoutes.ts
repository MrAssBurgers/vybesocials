/**
 * Routes where LocationProvider may request geolocation.
 * Local feed / Friend Link Nearby / AI chat request GPS in their own feature hooks —
 * not via this provider — and only when those features are used.
 */
export function isMapRoute(pathname: string): boolean {
  return pathname === '/map' || pathname.startsWith('/map/');
}
