/**
 * Shared scroll-direction hide/show for bottom nav + floating FABs.
 */

import { getAppScrollContainer, getAppScrollTop } from '@/lib/appScrollContainer';

type Listener = (visible: boolean) => void;

let scrollVisible = true;
let lastScrollY = 0;
let ticking = false;
let cleanup: (() => void) | null = null;
let boundContainer: HTMLElement | null = null;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn(scrollVisible);
    } catch {
      /* ignore */
    }
  });
}

function handleScroll() {
  if (ticking) return;
  ticking = true;
  window.requestAnimationFrame(() => {
    const currentScrollY = getAppScrollTop();
    const scrollDiff = currentScrollY - lastScrollY;

    if (currentScrollY < 40) {
      scrollVisible = true;
    } else if (Math.abs(scrollDiff) > 8) {
      scrollVisible = scrollDiff < 0;
    }

    lastScrollY = currentScrollY;
    ticking = false;
    notify();
  });
}

export function resetScrollHideVisible(): void {
  scrollVisible = true;
  lastScrollY = getAppScrollTop();
  notify();
}

/** Bind scroll listener to the app main container (call once from AppLayout). */
export function bindAppScrollHideContainer(): () => void {
  const container = getAppScrollContainer();
  if (!container || container === boundContainer) {
    return () => {};
  }

  if (boundContainer) {
    boundContainer.removeEventListener('scroll', handleScroll);
  }

  boundContainer = container;
  boundContainer.addEventListener('scroll', handleScroll, { passive: true });
  lastScrollY = getAppScrollTop();

  if (!cleanup) {
    window.addEventListener('scroll', handleScroll, { passive: true });
    cleanup = () => {
      window.removeEventListener('scroll', handleScroll);
      boundContainer?.removeEventListener('scroll', handleScroll);
      boundContainer = null;
      cleanup = null;
    };
  }

  return () => {
    if (boundContainer === container) {
      container.removeEventListener('scroll', handleScroll);
      boundContainer = null;
    }
  };
}

export function subscribeScrollHide(callback: Listener): () => void {
  listeners.add(callback);
  callback(scrollVisible);
  bindAppScrollHideContainer();

  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && cleanup) {
      cleanup();
    }
  };
}

export function isScrollHideVisible(): boolean {
  return scrollVisible;
}
