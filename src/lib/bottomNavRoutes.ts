/**
 * Instagram-style bottom nav visibility — only on primary tab surfaces.
 * Hidden on threads, post detail, settings, other users' profiles, upload, etc.
 */

export type ProfileNavIdentity = {
  username?: string | null;
  id?: string | null;
} | null | undefined;

const PRIMARY_TAB_PATHS = new Set(['/home', '/clips', '/explore', '/messages']);

export function isOwnProfilePath(pathname: string, profile?: ProfileNavIdentity): boolean {
  if (pathname === '/profile') return true;
  if (!profile) return false;

  const username = profile.username?.toLowerCase();
  const userMatch = pathname.match(/^\/u\/([^/]+)$/);
  if (userMatch && username) {
    return userMatch[1].toLowerCase() === username;
  }

  const profileMatch = pathname.match(/^\/profile\/([^/]+)$/);
  if (profileMatch) {
    const segment = profileMatch[1];
    if (username && segment.toLowerCase() === username) return true;
    if (profile.id && segment === profile.id) return true;
  }

  return false;
}

/** True when the route is a primary bottom-nav tab (inbox, not a DM thread). */
export function isBottomNavTabRoute(pathname: string, profile?: ProfileNavIdentity): boolean {
  if (PRIMARY_TAB_PATHS.has(pathname)) return true;
  return isOwnProfilePath(pathname, profile);
}
