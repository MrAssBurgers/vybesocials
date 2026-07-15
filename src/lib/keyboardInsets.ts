import { isDespiaRuntime } from '@/lib/despiaBridge';

/** True only on mobile web / Despia — desktop browsers must not get fake keyboard insets. */
export function shouldTrackSoftKeyboard(): boolean {
  if (typeof window === 'undefined') return false;
  if (isDespiaRuntime()) return true;
  const narrow = window.innerWidth < 768;
  if (!narrow) return false;
  // Coarse pointer OR touch/hover-none (Chrome device mode often reports pointer:fine).
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return coarse || noHover || touch;
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
