import { useEffect, useRef } from 'react';

// Shared state - singleton pattern
let scrollListenerAttached = false;
let isScrolling = false;
let settleRaf: number | null = null;
let settleTimeout: ReturnType<typeof setTimeout> | null = null;
let appScrollContainer: Element | null = null;

function markScrolling() {
  if (!isScrolling) {
    isScrolling = true;
    document.documentElement.classList.add('is-scrolling');
  }
  // Schedule settle: wait for input to stop, then 2 idle frames before clearing.
  if (settleTimeout) clearTimeout(settleTimeout);
  if (settleRaf !== null) cancelAnimationFrame(settleRaf);
  settleTimeout = setTimeout(() => {
    settleRaf = requestAnimationFrame(() => {
      settleRaf = requestAnimationFrame(() => {
        isScrolling = false;
        document.documentElement.classList.remove('is-scrolling');
      });
    });
  }, 90);
}

function bindAppScrollContainer() {
  const next = document.querySelector('[data-app-scroll-container="true"]');
  if (next === appScrollContainer) return;
  if (appScrollContainer) {
    appScrollContainer.removeEventListener('scroll', markScrolling);
  }
  appScrollContainer = next;
  if (appScrollContainer) {
    appScrollContainer.addEventListener('scroll', markScrolling, { passive: true });
  }
}

/**
 * Lightweight scroll optimization hook - uses passive listeners.
 * SINGLETON: Only one listener set across all components.
 *
 * Listens to window wheel/touchmove plus the main app scroll container so
 * feed/thread scroll pauses expensive animations on native WebViews.
 */
export function useScrollOptimization() {
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    if (scrollListenerAttached) return;
    scrollListenerAttached = true;

    const opts: AddEventListenerOptions = { passive: true, capture: true };

    window.addEventListener('scroll', markScrolling, opts);
    window.addEventListener('wheel', markScrolling, opts);
    window.addEventListener('touchmove', markScrolling, opts);

    bindAppScrollContainer();
    observerRef.current = new MutationObserver(bindAppScrollContainer);
    observerRef.current.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener('scroll', markScrolling, { capture: true } as any);
      window.removeEventListener('wheel', markScrolling, opts);
      window.removeEventListener('touchmove', markScrolling, opts);
      if (appScrollContainer) {
        appScrollContainer.removeEventListener('scroll', markScrolling);
        appScrollContainer = null;
      }
      observerRef.current?.disconnect();
      observerRef.current = null;
      scrollListenerAttached = false;
      if (settleTimeout) clearTimeout(settleTimeout);
      if (settleRaf !== null) cancelAnimationFrame(settleRaf);
      isScrolling = false;
      document.documentElement.classList.remove('is-scrolling');
    };
  }, []);
}

/**
 * Lightweight GPU acceleration - only applies essential styles
 */
export function useGPUAcceleration(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.transform = 'translateZ(0)';
    return () => {
      element.style.transform = '';
    };
  }, [ref]);
}

/**
 * Reduced motion detection - cached result
 */
let cachedReducedMotion: boolean | null = null;
export function usePrefersReducedMotion() {
  if (cachedReducedMotion === null && typeof window !== 'undefined') {
    cachedReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return cachedReducedMotion ?? false;
}

/**
 * Simplified frame callback - only runs when enabled
 */
export function useFrameCallback(callback: () => void, enabled = true) {
  const frameRef = useRef<number>();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (!enabled) return;
    let isActive = true;
    const tick = () => {
      if (!isActive) return;
      callbackRef.current();
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      isActive = false;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [enabled]);
}
