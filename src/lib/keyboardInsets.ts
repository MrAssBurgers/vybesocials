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
    const fromVv = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    if (fromVv > KEYBOARD_INSET_THRESHOLD_PX) return fromVv;
  }

  const shrink = Math.max(0, (window.screen.height || window.innerHeight) - window.innerHeight);
  if (shrink > KEYBOARD_INSET_THRESHOLD_PX) return shrink;

  return 0;
}
