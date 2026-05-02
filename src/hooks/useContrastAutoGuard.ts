import { useEffect } from 'react';
import {
  contrastRatio,
  getEffectiveBg,
  parseColor,
  pickReadable,
} from '@/lib/contrastGuard';

/**
 * Runtime Contrast Auto-Guard.
 *
 * Scans visible text nodes, measures WCAG contrast against the effective
 * background, and rewrites color when below threshold. Auto-restores when
 * the underlying surface changes back to a readable combo.
 *
 * Opt out with `data-no-auto-contrast` on any ancestor.
 */
const SELECTOR =
  'p, span, label, a, button, h1, h2, h3, h4, h5, h6, li, dt, dd, [data-auto-contrast]';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'IMG', 'VIDEO', 'CANVAS', 'IFRAME']);

const AA_BODY = 4.5;
const AA_LARGE = 3;

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
};

interface CacheEntry {
  fgKey: string;
  bgKey: string;
  ratio: number;
}

const cache = new WeakMap<Element, CacheEntry>();

function isLargeText(el: Element) {
  const cs = window.getComputedStyle(el);
  const size = parseFloat(cs.fontSize) || 16;
  const weight = parseInt(cs.fontWeight, 10) || 400;
  // WCAG: large = 18pt (~24px) or 14pt bold (~18.66px bold)
  if (size >= 24) return true;
  if (size >= 18.66 && weight >= 700) return true;
  return false;
}

function shouldSkip(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.closest('[data-no-auto-contrast]')) return true;
  if (el.closest('[data-auto-contrast="off"]')) return true;
  // Skip if element uses transparent text-fill (gradient text effects)
  const cs = window.getComputedStyle(el);
  if (
    cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)' ||
    cs.webkitTextFillColor === 'transparent'
  ) {
    return true;
  }
  // Skip if no actual rendered text directly inside
  let hasText = false;
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent || '').trim()) {
      hasText = true;
      break;
    }
  }
  if (!hasText) return true;
  return false;
}

function processElement(el: Element) {
  if (shouldSkip(el)) return;

  const cs = window.getComputedStyle(el);
  const fg = parseColor(cs.color);
  if (!fg || fg.a < 0.05) return;

  const bg = getEffectiveBg(el);
  const fgKey = `${fg.r},${fg.g},${fg.b},${fg.a.toFixed(2)}`;
  const bgKey = `${bg.r},${bg.g},${bg.b}`;

  const cached = cache.get(el);
  if (cached && cached.fgKey === fgKey && cached.bgKey === bgKey) return;

  // Honor a manual override placed on the element or any ancestor:
  //   data-force-contrast="dark"  → pin near-black foreground
  //   data-force-contrast="light" → pin near-white foreground
  const forced = el.closest('[data-force-contrast]') as HTMLElement | null;
  if (forced) {
    const mode = forced.getAttribute('data-force-contrast');
    const htmlEl = el as HTMLElement;
    const color = mode === 'light' ? 'rgb(245, 245, 247)' : 'rgb(14, 14, 18)';
    htmlEl.style.setProperty('--auto-contrast-color', color);
    htmlEl.setAttribute('data-contrast-fixed', 'forced');
    cache.set(el, { fgKey, bgKey, ratio: 21 });
    return;
  }

  const ratio = contrastRatio(fg, bg);
  const threshold = isLargeText(el) ? AA_LARGE : AA_BODY;

  const htmlEl = el as HTMLElement;
  if (ratio < threshold) {
    const readable = pickReadable(bg);
    htmlEl.style.setProperty('--auto-contrast-color', readable);
    htmlEl.setAttribute('data-contrast-fixed', ratio.toFixed(2));
  } else if (htmlEl.hasAttribute('data-contrast-fixed')) {
    // If the underlying surface has changed enough that the *original* color
    // would now pass cleanly with a comfortable margin, release the override.
    // Wider margin (+2.5) prevents flicker loops on themed pages where the
    // sampled background can jiggle slightly between scans.
    if (ratio >= threshold + 2.5) {
      htmlEl.style.removeProperty('--auto-contrast-color');
      htmlEl.removeAttribute('data-contrast-fixed');
      cache.set(el, { fgKey, bgKey, ratio });
      return;
    }
    cache.set(el, { fgKey, bgKey, ratio });
    return;
  }

  cache.set(el, { fgKey, bgKey, ratio });
}

let scheduled = false;
let pending: Set<Element> | null = null;

function scheduleScan(roots?: Element[]) {
  if (!pending) pending = new Set<Element>();
  if (roots && roots.length) {
    for (const r of roots) pending.add(r);
  } else {
    pending.add(document.body);
  }
  if (scheduled) return;
  scheduled = true;
  const run = () => {
    scheduled = false;
    const targets = pending;
    pending = null;
    if (!targets) return;
    let count = 0;
    const MAX = 600;
    for (const root of targets) {
      if (!root.isConnected) continue;
      // Process root itself if it matches
      if (root.matches?.(SELECTOR)) {
        processElement(root);
        if (++count >= MAX) break;
      }
      const nodes = root.querySelectorAll?.(SELECTOR);
      if (!nodes) continue;
      for (const node of Array.from(nodes)) {
        processElement(node);
        if (++count >= MAX) break;
      }
      if (count >= MAX) break;
    }
    if (count >= MAX) {
      // Continue next idle tick if we hit the cap
      scheduleScan();
    }
  };
  const idleWindow = window as IdleWindow;
  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(run, { timeout: 300 });
  } else {
    setTimeout(run, 16);
  }
}

export function useContrastAutoGuard(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    // Disable on very low-memory devices
    const dm = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (typeof dm === 'number' && dm < 2) return;

    let debounceTimer: number | undefined;
    let scrollTimer: number | undefined;
    let isScrolling = false;
    const debouncedFullScan = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => scheduleScan(), 150);
    };
    const pauseDuringScroll = () => {
      isScrolling = true;
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        isScrolling = false;
        scheduleScan();
      }, 180);
    };

    // Initial scan after first paint
    const initialId = window.setTimeout(() => scheduleScan(), 250);

    // Observe DOM changes
    const observer = new MutationObserver((mutations) => {
      if (isScrolling || document.documentElement.classList.contains('is-scrolling')) return;
      const roots: Element[] = [];
      for (const m of mutations) {
        if (m.type === 'childList') {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === Node.ELEMENT_NODE) roots.push(n as Element);
          });
        } else if (m.type === 'attributes' && m.target.nodeType === Node.ELEMENT_NODE) {
          roots.push(m.target as Element);
        }
      }
      if (roots.length) scheduleScan(roots);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });

    // Theme / resize triggers
    const onResize = () => debouncedFullScan();
    const onTheme = () => debouncedFullScan();
    window.addEventListener('resize', onResize, { passive: true });
    const scrollOptions: AddEventListenerOptions = { passive: true, capture: true };
    const removeScrollOptions: EventListenerOptions = { capture: true };
    window.addEventListener('scroll', pauseDuringScroll, scrollOptions);
    window.addEventListener('wheel', pauseDuringScroll, scrollOptions);
    window.addEventListener('touchmove', pauseDuringScroll, scrollOptions);
    window.addEventListener('themechange', onTheme);
    document.addEventListener('visibilitychange', onTheme);

    // Re-scan ONLY when overlay portals finish their open animation. We
    // intentionally skip `transitionend` (fires constantly on hover, marquees,
    // pulses) and skip animationend on plain decorative animations to avoid
    // re-running the scan on every keyframe loop.
    const onAnimEnd = (e: Event) => {
      const target = e.target as Element | null;
      if (!target || target.nodeType !== Node.ELEMENT_NODE) return;
      const overlay = target.closest?.(
        '[data-radix-portal] [data-state="open"], [role="dialog"][data-state="open"]',
      );
      if (overlay) scheduleScan([overlay]);
    };
    document.addEventListener('animationend', onAnimEnd, true);

    return () => {
      window.clearTimeout(initialId);
      window.clearTimeout(debounceTimer);
      window.clearTimeout(scrollTimer);
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', pauseDuringScroll, removeScrollOptions);
      window.removeEventListener('wheel', pauseDuringScroll, removeScrollOptions);
      window.removeEventListener('touchmove', pauseDuringScroll, removeScrollOptions);
      window.removeEventListener('themechange', onTheme);
      document.removeEventListener('visibilitychange', onTheme);
      document.removeEventListener('animationend', onAnimEnd, true);
    };
  }, [enabled]);
}
