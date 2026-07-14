/**
 * Bottom nav visibility — primary tabs plus own profile.
 * DM conversation threads keep the nav mounted so Home/Clips remain an escape hatch.
 */

export type ProfileNavIdentity = {
  username?: string | null;
  id?: string | null;
} | null | undefined;

const PRIMARY_TAB_PATHS = new Set(['/home', '/clips', '/explore', '/messages']);

/** Immersive Messages siblings — hide bottom nav (not conversation threads). */
const MESSAGES_IMMERSIVE_SEGMENTS = new Set(['search', 'requests', 'new', 'ai-autisy']);

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

/** True when pathname is a DM thread under /messages/:id (not immersive siblings). */
export function isMessagesThreadPath(pathname: string): boolean {
  if (!pathname.startsWith('/messages/')) return false;
  const rest = pathname.slice('/messages/'.length).split(/[/?#]/)[0] ?? '';
  if (!rest) return false;
  return !MESSAGES_IMMERSIVE_SEGMENTS.has(rest);
}

/** True when the Messages bottom-nav tab should render as active. */
export function isMessagesNavActive(pathname: string): boolean {
  return pathname === '/messages' || isMessagesThreadPath(pathname);
}

/** True when the floating bottom nav should mount on this route. */
export function isBottomNavTabRoute(pathname: string, profile?: ProfileNavIdentity): boolean {
  if (PRIMARY_TAB_PATHS.has(pathname)) return true;
  // Keep nav on open DMs so users can leave via Home/Clips without relying only on Back.
  if (isMessagesThreadPath(pathname)) return true;
  return isOwnProfilePath(pathname, profile);
}
