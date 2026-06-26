/**
 * BottomNavController — scroll-driven hide/show without jitter.
 * Hides on deliberate scroll-down; stays hidden until intentional scroll-up.
 * Updates DOM data-attribute directly (transform via CSS); React subscribes only on settled state changes.
 */
import { getAppScrollContainer, getAppScrollTop } from '@/lib/appScrollContainer';

type Listener = (visible: boolean) => void;

const HIDE_DELTA_PX = 22;
const SHOW_ACCUM_PX = 56;
const NOISE_FLOOR_PX = 4;
const TOP_ALWAYS_SHOW_PX = 36;

let scrollVisible = true;
let hiddenByScrollDown = false;
let upwardAccum = 0;
let lastScrollY = 0;
let lastScrollTime = 0;
let ticking = false;
let cleanup: (() => void) | null = null;
let boundContainer: HTMLElement | null = null;
let rebindTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();

function applyDomState(visible: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute(
    'data-vybe-bottom-nav-scroll',
    visible ? 'visible' : 'hidden',
  );
}

function notify() {
  applyDomState(scrollVisible);
  listeners.forEach((fn) => {
    try {
      fn(scrollVisible);
    } catch {
      /* ignore */
    }
  });
}

function setVisible(visible: boolean) {
  if (scrollVisible === visible) return;
  scrollVisible = visible;
  notify();
}

function handleScroll() {
  if (ticking) return;
  ticking = true;
  window.requestAnimationFrame(() => {
    const now = performance.now();
    const currentScrollY = getAppScrollTop();
    const scrollDiff = currentScrollY - lastScrollY;
    const elapsed = Math.max(now - lastScrollTime, 1);

    if (Math.abs(scrollDiff) < NOISE_FLOOR_PX) {
      ticking = false;
      return;
    }

    if (currentScrollY <= TOP_ALWAYS_SHOW_PX) {
      hiddenByScrollDown = false;
      upwardAccum = 0;
      setVisible(true);
    } else if (scrollDiff > HIDE_DELTA_PX) {
      const velocity = scrollDiff / elapsed;
      if (velocity > 0.15 || scrollDiff > HIDE_DELTA_PX * 1.5) {
        hiddenByScrollDown = true;
        upwardAccum = 0;
        setVisible(false);
      }
    } else if (scrollDiff < 0 && hiddenByScrollDown) {
      upwardAccum += Math.abs(scrollDiff);
      if (upwardAccum >= SHOW_ACCUM_PX) {
        hiddenByScrollDown = false;
        upwardAccum = 0;
        setVisible(true);
      }
    } else if (scrollDiff > 0 && hiddenByScrollDown) {
      upwardAccum = Math.max(0, upwardAccum - scrollDiff * 0.25);
    }

    lastScrollY = currentScrollY;
    lastScrollTime = now;
    ticking = false;
  });
}

export function resetBottomNavScrollVisible(): void {
  scrollVisible = true;
  hiddenByScrollDown = false;
  upwardAccum = 0;
  lastScrollY = getAppScrollTop();
  lastScrollTime = performance.now();
  notify();
}

function attachContainerListener() {
  if (cleanup) return;
  const container = getAppScrollContainer();
  if (container) {
    boundContainer = container;
    boundContainer.addEventListener('scroll', handleScroll, { passive: true });
  }
  window.addEventListener('scroll', handleScroll, { passive: true });
  cleanup = () => {
    boundContainer?.removeEventListener('scroll', handleScroll);
    window.removeEventListener('scroll', handleScroll);
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
  lastScrollTime = performance.now();
}

export function bindBottomNavScrollContainer(): () => void {
  attachContainerListener();
  tryBindContainer();
  applyDomState(scrollVisible);
  if (!rebindTimer) {
    rebindTimer = setInterval(() => {
      if (listeners.size === 0) return;
      tryBindContainer();
    }, 2000);
  }
  return () => {
    if (boundContainer) {
      boundContainer.removeEventListener('scroll', handleScroll);
      boundContainer = null;
    }
  };
}

export function subscribeBottomNavScroll(callback: Listener): () => void {
  listeners.add(callback);
  callback(scrollVisible);
  bindBottomNavScrollContainer();
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && cleanup) {
      cleanup();
    }
  };
}

export function isBottomNavScrollVisible(): boolean {
  return scrollVisible;
}
