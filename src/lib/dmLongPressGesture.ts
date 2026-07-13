export type ConversationGestureIntent = 'pending' | 'scrolling' | 'swiping';

export function classifyConversationGestureMove(
  dx: number,
  dy: number,
  holdCancelPx = 8,
  swipeActivatePx = 12,
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
  holdMs = 480,
  holdCancelPx = 8,
): boolean {
  return (
    elapsedMs >= holdMs &&
    Math.abs(dx) <= holdCancelPx &&
    Math.abs(dy) <= holdCancelPx
  );
}
