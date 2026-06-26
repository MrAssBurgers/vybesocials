/**
 * BottomNavController — scroll-driven hide/show without jitter.
 * Hides on accumulated scroll-down; stays hidden until intentional scroll-up.
 * Updates DOM data-attribute directly (transform via CSS); React subscribes only on settled state changes.
 */
import { getAppScrollContainer, getAppScrollTop } from '@/lib/appScrollContainer';

type Listener = (visible: boolean) => void;

const HIDE_ACCUM_PX = 48;
const SHOW_ACCUM_PX = 56;
const NOISE_FLOOR_PX = 3;
const TOP_ALWAYS_SHOW_PX = 36;

let scrollVisible = true;
let hiddenByScrollDown = false;
let downAccum = 0;
let upwardAccum = 0;
let lastScrollY = 0;
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
    const currentScrollY = getAppScrollTop();
    const scrollDiff = currentScrollY - lastScrollY;

    if (Math.abs(scrollDiff) < NOISE_FLOOR_PX) {
      ticking = false;
      return;
    }

    if (currentScrollY <= TOP_ALWAYS_SHOW_PX) {
      hiddenByScrollDown = false;
      downAccum = 0;
      upwardAccum = 0;
      setVisible(true);
    } else if (scrollDiff > 0) {
      downAccum += scrollDiff;
      upwardAccum = 0;
      if (!hiddenByScrollDown && downAccum >= HIDE_ACCUM_PX) {
        hiddenByScrollDown = true;
        downAccum = 0;
        setVisible(false);
      }
    } else if (scrollDiff < 0 && hiddenByScrollDown) {
      upwardAccum += Math.abs(scrollDiff);
      downAccum = 0;
      if (upwardAccum >= SHOW_ACCUM_PX) {
        hiddenByScrollDown = false;
        upwardAccum = 0;
        setVisible(true);
      }
    } else if (scrollDiff < 0) {
      downAccum = 0;
    }

    lastScrollY = currentScrollY;
    ticking = false;
  });
}

export function resetBottomNavScrollVisible(): void {
  scrollVisible = true;
  hiddenByScrollDown = false;
  downAccum = 0;
  upwardAccum = 0;
  lastScrollY = getAppScrollTop();
  notify();
}

function attachContainerListener() {
  if (cleanup) return;
  tryBindContainer();
  cleanup = () => {
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

export function bindBottomNavScrollContainer(): () => void {
  attachContainerListener();
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
