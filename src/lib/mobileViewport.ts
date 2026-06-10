import { detectIsIPad } from '@/lib/deviceDetection';

const TABLET_BREAKPOINT = 1024;

/** Sync check — use for first paint before useEffect runs. */
export function isMobileOrTabletViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < TABLET_BREAKPOINT || detectIsIPad();
}
