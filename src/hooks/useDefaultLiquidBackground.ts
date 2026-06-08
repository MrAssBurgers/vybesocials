import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useAppBackground } from '@/components/layout/AppBackground';
import { STABLE_APP_BACKGROUND } from '@/lib/appBackgroundMode';
import { isAuthLiquidPath, isExcludedLiquidPath } from '@/lib/vybeLiquidPaths';

/** Primary app surfaces where guests can browse without signing in */
const GUEST_APP_PATHS = ['/home', '/explore', '/clips', '/shorts'] as const;

function isGuestAppPath(pathname: string): boolean {
  return GUEST_APP_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function canUseDefaultLiquidExperience(
  hasUserWallpaper: boolean,
  isBackgroundResolved: boolean,
): boolean {
  if (STABLE_APP_BACKGROUND) return false;
  return isBackgroundResolved && !hasUserWallpaper;
}

/**
 * True when the portaled app-shell aurora should show (Home, Explore, etc.).
 * Disabled in stable mode — app uses solid `hsl(var(--background))` instead.
 */
export function useDefaultLiquidBackground(): boolean {
  const { user } = useAuth();
  const { hasUserWallpaper, isBackgroundResolved } = useAppBackground();
  const { pathname } = useLocation();

  return useMemo(() => {
    if (!canUseDefaultLiquidExperience(hasUserWallpaper, isBackgroundResolved)) return false;
    if (isExcludedLiquidPath(pathname)) return false;
    if (user) return true;
    return isGuestAppPath(pathname);
  }, [user, hasUserWallpaper, isBackgroundResolved, pathname]);
}

/** Inline aurora on auth Landing — off in stable mode. */
export function useAuthLandingLiquid(): boolean {
  const { hasUserWallpaper, isBackgroundResolved } = useAppBackground();
  const { pathname } = useLocation();

  return useMemo(
    () =>
      canUseDefaultLiquidExperience(hasUserWallpaper, isBackgroundResolved) &&
      isAuthLiquidPath(pathname),
    [hasUserWallpaper, isBackgroundResolved, pathname],
  );
}

/** Tap ripples + blob pull — off in stable mode. */
export function useLiquidTouchActive(): boolean {
  const showApp = useDefaultLiquidBackground();
  const showAuth = useAuthLandingLiquid();
  if (STABLE_APP_BACKGROUND) return false;
  return showApp || showAuth;
}
