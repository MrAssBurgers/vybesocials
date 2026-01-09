// Scroll Position Memory
// Remembers and restores scroll positions for feeds

const scrollPositions: Map<string, number> = new Map();

// Save scroll position for a route
export function saveScrollPosition(routeKey: string): void {
  scrollPositions.set(routeKey, window.scrollY);
}

// Restore scroll position for a route
export function restoreScrollPosition(routeKey: string): void {
  const position = scrollPositions.get(routeKey);
  if (position !== undefined) {
    // Use requestAnimationFrame for smoother restoration
    requestAnimationFrame(() => {
      window.scrollTo({ top: position, behavior: 'instant' });
    });
  }
}

// Clear scroll position for a route
export function clearScrollPosition(routeKey: string): void {
  scrollPositions.delete(routeKey);
}

// Clear all scroll positions
export function clearAllScrollPositions(): void {
  scrollPositions.clear();
}

// Get current scroll position for a route
export function getScrollPosition(routeKey: string): number | undefined {
  return scrollPositions.get(routeKey);
}
