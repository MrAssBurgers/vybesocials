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

/** Single entry — ripples + blob pull. No-op when custom wallpaper is active. */
export function triggerVybeLiquidTouch(clientX: number, clientY: number): void {
  if (!isVybeLiquidTouchSystemActive()) return;

  const now = Date.now();
  if (now - lastTouchAt < 80) return;
  lastTouchAt = now;
  touchVisualListener?.(clientX, clientY);
  bgBoostListener?.(clientX, clientY);
}

/** @deprecated Use triggerVybeLiquidTouch */
export function emitVybeLiquidBgBoost(clientX: number, clientY: number): void {
  if (!isVybeLiquidTouchSystemActive()) return;
  bgBoostListener?.(clientX, clientY);
}
