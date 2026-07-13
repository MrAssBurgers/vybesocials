import { isNativePerfMode } from '@/lib/nativePerfMode';

/** Project-standard expo-out easing — smooth deceleration, no bounce. */
export const BUTTER_EASE = [0.16, 1, 0.3, 1] as const;

/** Default MotionConfig transition — tween beats spring for scroll-adjacent UI. */
export const BUTTER_TRANSITION = {
  type: 'tween' as const,
  ease: BUTTER_EASE,
  duration: isNativePerfMode() ? 0.2 : 0.22,
};

/** Route / tab crossfade */
export const ROUTE_FADE_MS = isNativePerfMode() ? 160 : 180;

/** Paths that should stay instant (immersive / thread scroll surfaces). */
export function shouldSkipRouteFade(pathname: string): boolean {
  if (pathname === '/messages') return true;
  if (pathname.startsWith('/messages/') && pathname !== '/messages/new') return true;
  if (pathname.startsWith('/clips/')) return true;
  if (pathname.startsWith('/space/')) return true;
  if (pathname.startsWith('/p/')) return true;
  return false;
}
