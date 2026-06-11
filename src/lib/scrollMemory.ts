// Scroll Position Memory — uses AppLayout main scroll container, not window.

import { getAppScrollContainer, getAppScrollTop, scrollAppTo } from '@/lib/appScrollContainer';

const scrollPositions: Map<string, number> = new Map();

export function saveScrollPosition(routeKey: string): void {
  scrollPositions.set(routeKey, getAppScrollTop());
}

export function restoreScrollPosition(routeKey: string): void {
  const position = scrollPositions.get(routeKey);
  if (position === undefined) return;
  requestAnimationFrame(() => {
    scrollAppTo(position, 'instant' as ScrollBehavior);
  });
}

export function clearScrollPosition(routeKey: string): void {
  scrollPositions.delete(routeKey);
}

export function clearAllScrollPositions(): void {
  scrollPositions.clear();
}

export function getScrollPosition(routeKey: string): number | undefined {
  return scrollPositions.get(routeKey);
}
