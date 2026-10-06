import { useForegroundReadPhase } from './useForegroundReadPhase';

/** Resume through the card's autoplay policy when the app returns to the foreground. */
export function useClipPageVisible() {
  // Share the page's native phase so a newly mounted card cannot forget a
  // pause delivered before it mounted. Each card still owns its play policy.
  return useForegroundReadPhase().foreground;
}
