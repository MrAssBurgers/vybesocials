import { isVybeLiquidTouchSystemActive } from '@/lib/liquidShellState';

type VybeLiquidTouchListener = (clientX: number, clientY: number) => void;

let touchVisualListener: VybeLiquidTouchListener | null = null;
let bgBoostListener: VybeLiquidTouchListener | null = null;
let lastTouchAt = 0;

/** Ripples / wash / surge overlay registers here. */
export function registerVybeLiquidTouchVisuals(listener: VybeLiquidTouchListener): () => void {
  touchVisualListener = listener;
  return () => {
    if (touchVisualListener === listener) touchVisualListener = null;
  };
}

/** Background aurora (inline Landing or portaled mount) registers pull/boost on tap. */
export function registerVybeLiquidBgBoost(listener: VybeLiquidTouchListener): () => void {
  bgBoostListener = listener;
  return () => {
    if (bgBoostListener === listener) bgBoostListener = null;
  };
}

/** Single entry — small ripple only. Skips heavy aurora boost + during scroll. */
export function triggerVybeLiquidTouch(clientX: number, clientY: number): void {
  if (!isVybeLiquidTouchSystemActive()) return;
  if (typeof document !== 'undefined' &&
      document.documentElement.classList.contains('is-scrolling')) return;

  const now = Date.now();
  if (now - lastTouchAt < 220) return;
  lastTouchAt = now;
  touchVisualListener?.(clientX, clientY);
  // Intentionally NOT calling bgBoostListener — the aurora background pull
  // was causing visible jank on every tap on mid-tier devices.
}


/** @deprecated Use triggerVybeLiquidTouch */
export function emitVybeLiquidBgBoost(clientX: number, clientY: number): void {
  if (!isVybeLiquidTouchSystemActive()) return;
  bgBoostListener?.(clientX, clientY);
}
