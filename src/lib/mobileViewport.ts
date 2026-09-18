import { preferTouchAppShell } from '@/lib/deviceDetection';

const TABLET_BREAKPOINT = 1024;

/** Sync check — use for first paint before useEffect runs. */
export function isMobileOrTabletViewport(): boolean {
  if (typeof window === 'undefined') return false;
  // [Android-only] Fold / Despia: preferTouchAppShell covers ≥1024 CSS px inner screens.
  return window.innerWidth < TABLET_BREAKPOINT || preferTouchAppShell();
}
