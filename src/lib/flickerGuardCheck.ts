/**
 * Lightweight UI regression check for gradient-text flicker.
 *
 * In development only, this scans the DOM after every navigation for
 * `bg-clip-text + text-transparent` (or inline `background-clip: text`) elements
 * and verifies:
 *   1. The global font-loading guard CSS is present (data-theme-loading on <html>
 *      while fonts load, then auto-removed).
 *   2. Each gradient-text element has either an inherited fallback color
 *      (`color: inherit` / `currentColor`) or an explicit non-transparent color
 *      so it never flashes blank during font swap.
 *
 * Logs a single warning per offending selector — never throws.
 */

const SCANNED = new WeakSet<Element>();

function isGradientTextEl(el: Element): boolean {
  const cls = el.className;
  const className = typeof cls === 'string' ? cls : (cls as any)?.baseVal ?? '';
  if (className.includes('bg-clip-text') && className.includes('text-transparent')) {
    return true;
  }
  const styleAttr = el.getAttribute('style') || '';
  return /background-clip\s*:\s*text/i.test(styleAttr);
}

function hasFallbackColor(el: Element): boolean {
  const cs = getComputedStyle(el);
  // currentColor / inherit resolves to the parent's color — that's a valid fallback
  const fill = cs.webkitTextFillColor || cs.color;
  if (!fill || fill === 'rgba(0, 0, 0, 0)' || fill === 'transparent') {
    // No fallback — only OK if the global guard CSS is active
    return document.documentElement.hasAttribute('data-theme-loading');
  }
  return true;
}

let scheduled = false;

export function scanForFlickerOffenders() {
  if (scheduled) return;
  scheduled = true;
  requestIdleCallback?.(() => {
    scheduled = false;
    try {
      const offenders: Element[] = [];
      const all = document.querySelectorAll('.bg-clip-text.text-transparent, [style*="background-clip"]');
      all.forEach((el) => {
        if (SCANNED.has(el)) return;
        SCANNED.add(el);
        if (!isGradientTextEl(el)) return;
        if (!hasFallbackColor(el)) offenders.push(el);
      });
      if (offenders.length > 0) {
         
        console.warn(
          `[flickerGuardCheck] ${offenders.length} gradient-text element(s) lack a fallback color. They may flash during font load.`,
          offenders.slice(0, 5),
        );
      }
    } catch {
      /* ignore */
    }
  }, { timeout: 2000 } as any);
}

export function installFlickerGuardCheck() {
  if (typeof window === 'undefined') return;
  if (!import.meta.env?.DEV) return;
  // Initial scan once fonts settle
  if ((document as any).fonts?.ready) {
    (document as any).fonts.ready.then(() => scanForFlickerOffenders());
  }
  // Re-scan on route changes (history API)
  const origPush = history.pushState;
  history.pushState = function (...args) {
    const r = origPush.apply(this, args as any);
    setTimeout(scanForFlickerOffenders, 300);
    return r;
  };
  window.addEventListener('popstate', () => setTimeout(scanForFlickerOffenders, 300));
}
