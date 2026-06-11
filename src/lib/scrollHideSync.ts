/**
 * Shared scroll-direction hide/show for bottom nav + floating FABs.
 * Single listener avoids FAB getting out of sync with nav.
 */

type Listener = (visible: boolean) => void;

let scrollVisible = true;
let lastScrollY = 0;
let ticking = false;
let cleanup: (() => void) | null = null;
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

function getScrollY(): number {
  const container = document.querySelector('[data-app-scroll-container="true"]');
  return container ? container.scrollTop : window.scrollY;
}

function handleScroll() {
  if (ticking) return;
  ticking = true;
  window.requestAnimationFrame(() => {
    const currentScrollY = getScrollY();
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
  lastScrollY = getScrollY();
  notify();
}

export function subscribeScrollHide(callback: Listener): () => void {
  listeners.add(callback);
  callback(scrollVisible);

  if (!cleanup) {
    window.addEventListener('scroll', handleScroll, { passive: true });

    const bindContainer = () => {
      const container = document.querySelector('[data-app-scroll-container="true"]');
      if (container && !(container as HTMLElement & { __vybeScrollBound?: boolean }).__vybeScrollBound) {
        container.addEventListener('scroll', handleScroll, { passive: true });
        (container as HTMLElement & { __vybeScrollBound?: boolean }).__vybeScrollBound = true;
      }
    };

    bindContainer();
    const observer = new MutationObserver(bindContainer);
    observer.observe(document.body, { childList: true, subtree: true });

    cleanup = () => {
      window.removeEventListener('scroll', handleScroll);
      observer.disconnect();
      const el = document.querySelector('[data-app-scroll-container="true"]');
      el?.removeEventListener('scroll', handleScroll);
      cleanup = null;
    };
  }

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
