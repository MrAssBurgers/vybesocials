import { isDespiaRuntime } from '@/lib/despiaBridge';

/** True only on mobile web / Despia — desktop browsers must not get fake keyboard insets. */
export function shouldTrackSoftKeyboard(): boolean {
  if (typeof window === 'undefined') return false;
  if (isDespiaRuntime()) return true;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.innerWidth < 768;
  return coarse && narrow;
}

export const KEYBOARD_INSET_THRESHOLD_PX = 48;

export function measureSoftKeyboardHeight(): number {
  if (!shouldTrackSoftKeyboard()) return 0;

  const vv = window.visualViewport;
  if (vv) {
    const layoutH = document.documentElement.clientHeight;
    const fromLayout = Math.max(0, layoutH - vv.height - vv.offsetTop);
    const fromInner = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    const kb = Math.max(fromLayout, fromInner);
    if (kb > KEYBOARD_INSET_THRESHOLD_PX) return kb;
    // Layout already resized for the keyboard — do not fall back to screen.height
    // or we double-lift in-flow composers (DM) on Despia / Android WebViews.
    return 0;
  }

  const shrink = Math.max(0, (window.screen.height || window.innerHeight) - window.innerHeight);
  if (shrink > KEYBOARD_INSET_THRESHOLD_PX) return shrink;

  return 0;
}
