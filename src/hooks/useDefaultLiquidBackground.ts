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

function canUseDefaultLiquidExperience(hasUserWallpaper: boolean): boolean {
  if (STABLE_APP_BACKGROUND || hasUserWallpaper) return false;
  // Always show aurora when there is no custom wallpaper — including while the
  // background DB fetch is in flight. Hiding aurora during fetch caused black flashes.
  return true;
}

/**
 * True when the portaled app-shell aurora should show (Home, Explore, etc.).
 * Disabled in stable mode — app uses solid `hsl(var(--background))` instead.
 */
export function useDefaultLiquidBackground(): boolean {
  const { user } = useAuth();
  const { hasUserWallpaper } = useAppBackground();
  const { pathname } = useLocation();

  return useMemo(() => {
    if (!canUseDefaultLiquidExperience(hasUserWallpaper)) return false;
    if (isExcludedLiquidPath(pathname)) return false;
    if (user) return true;
    return isGuestAppPath(pathname);
  }, [user, hasUserWallpaper, pathname]);
}

/** Inline aurora on auth Landing — off in stable mode. */
export function useAuthLandingLiquid(): boolean {
  const { hasUserWallpaper } = useAppBackground();
  const { pathname } = useLocation();

  return useMemo(
    () =>
      canUseDefaultLiquidExperience(hasUserWallpaper) &&
      isAuthLiquidPath(pathname),
    [hasUserWallpaper, pathname],
  );
}

/** Tap ripples + blob pull — disabled (press scale / liquid touch removed). */
export function useLiquidTouchActive(): boolean {
  return false;
}
