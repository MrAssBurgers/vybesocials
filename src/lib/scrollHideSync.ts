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
let rebindTimer: ReturnType<typeof setInterval> | null = null;
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
      if (!scrollVisible) {
        scrollVisible = true;
        notify();
      }
    } else if (Math.abs(scrollDiff) > 8) {
      const next = scrollDiff < 0;
      if (next !== scrollVisible) {
        scrollVisible = next;
        notify();
      }
    }

    lastScrollY = currentScrollY;
    ticking = false;
  });
}

export function resetScrollHideVisible(): void {
  scrollVisible = true;
  lastScrollY = getAppScrollTop();
  notify();
}

function attachGlobalListeners() {
  if (cleanup) return;
  // Window + document fallbacks so the FAB always reacts even when the app
  // scroll container hasn't been bound yet (or routes use the body scroll).
  window.addEventListener('scroll', handleScroll, { passive: true });
  document.addEventListener('scroll', handleScroll, { passive: true, capture: true });
  window.addEventListener('touchmove', handleScroll, { passive: true });
  window.addEventListener('wheel', handleScroll, { passive: true });
  cleanup = () => {
    window.removeEventListener('scroll', handleScroll);
    document.removeEventListener('scroll', handleScroll, { capture: true } as any);
    window.removeEventListener('touchmove', handleScroll);
    window.removeEventListener('wheel', handleScroll);
    boundContainer?.removeEventListener('scroll', handleScroll);
    boundContainer = null;
    if (rebindTimer) {
      clearInterval(rebindTimer);
      rebindTimer = null;
    }
    cleanup = null;
  };
}

function tryBindContainer() {
  const container = getAppScrollContainer();
  if (!container || container === boundContainer) return;
  if (boundContainer) {
    boundContainer.removeEventListener('scroll', handleScroll);
  }
  boundContainer = container;
  boundContainer.addEventListener('scroll', handleScroll, { passive: true });
  lastScrollY = getAppScrollTop();
}

/** Bind scroll listener to the app main container (call once from AppLayout). */
export function bindAppScrollHideContainer(): () => void {
  attachGlobalListeners();
  tryBindContainer();
  // Re-attempt periodically in case the container mounts later or routes swap
  // it. Cheap query selector — runs only while listeners exist.
  if (!rebindTimer) {
    rebindTimer = setInterval(() => {
      if (listeners.size === 0) return;
      tryBindContainer();
    }, 1000);
  }
  return () => {
    if (boundContainer) {
      boundContainer.removeEventListener('scroll', handleScroll);
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
