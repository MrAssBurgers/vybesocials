export type ConversationGestureIntent = 'pending' | 'scrolling' | 'swiping';

export const HOLD_MS = 450;
/** Finger jitter slop — phones easily drift past 10px during a deliberate hold. */
export const HOLD_CANCEL_PX = 18;
export const SWIPE_ACTIVATE_PX = 16;
export const TAP_SLOP_PX = 14;

export function classifyConversationGestureMove(
  dx: number,
  dy: number,
  holdCancelPx = HOLD_CANCEL_PX,
  swipeActivatePx = SWIPE_ACTIVATE_PX,
): ConversationGestureIntent {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDy > holdCancelPx && absDy > absDx) return 'scrolling';
  if (absDx > swipeActivatePx && absDx > absDy) return 'swiping';
  return 'pending';
}

export function shouldOpenConversationHold(
  elapsedMs: number,
  dx: number,
  dy: number,
  holdMs = HOLD_MS,
  holdCancelPx = HOLD_CANCEL_PX,
): boolean {
  return (
    elapsedMs >= holdMs &&
    Math.abs(dx) <= holdCancelPx &&
    Math.abs(dy) <= holdCancelPx
  );
}
