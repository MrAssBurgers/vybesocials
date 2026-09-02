import { useEffect, type MouseEvent as ReactMouseEvent } from 'react';

const FALLBACK_MAIN_ATTR = 'data-vybe-fallback-main';
const FALLBACK_TABINDEX_ATTR = 'data-vybe-fallback-tabindex';

function isVisibleElement(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
}

function removeFallbackMain(element: HTMLElement) {
  if (element.getAttribute(FALLBACK_MAIN_ATTR) !== 'true') return;
  if (element.id === 'main-content') element.removeAttribute('id');
  if (element.getAttribute('role') === 'main') element.removeAttribute('role');
  if (element.getAttribute(FALLBACK_TABINDEX_ATTR) === 'true') {
    element.removeAttribute('tabindex');
  }
  element.removeAttribute(FALLBACK_TABINDEX_ATTR);
  element.removeAttribute(FALLBACK_MAIN_ATTR);
}

/**
 * Keep exactly one usable main landmark while routes are swapped lazily.
 * Authenticated layouts already render #main-content. Public routes that do not
 * provide one receive the shared route shell as a temporary role="main"
 * landmark, and that fallback is removed as soon as a real page main mounts.
 */
export function syncMainLandmark(): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  const realMain = Array.from(
    document.querySelectorAll<HTMLElement>(
      `#main-content:not([${FALLBACK_MAIN_ATTR}]), main:not([${FALLBACK_MAIN_ATTR}]), [role="main"]:not([${FALLBACK_MAIN_ATTR}])`,
    ),
  ).find(isVisibleElement);

  const fallbacks = Array.from(
    document.querySelectorAll<HTMLElement>(`[${FALLBACK_MAIN_ATTR}="true"]`),
  );

  if (realMain) {
    fallbacks.forEach(removeFallbackMain);
    if (!realMain.id) realMain.id = 'main-content';
    if (!realMain.hasAttribute('tabindex')) realMain.tabIndex = -1;
    return realMain;
  }

  const routeShell = Array.from(
    document.querySelectorAll<HTMLElement>('[data-route-shell]'),
  ).find(isVisibleElement);

  fallbacks.forEach((element) => {
    if (element !== routeShell) removeFallbackMain(element);
  });

  if (!routeShell) return null;
  routeShell.id = 'main-content';
  routeShell.setAttribute('role', 'main');
  routeShell.setAttribute(FALLBACK_MAIN_ATTR, 'true');
  if (!routeShell.hasAttribute('tabindex')) {
    routeShell.tabIndex = -1;
    routeShell.setAttribute(FALLBACK_TABINDEX_ATTR, 'true');
  }
  return routeShell;
}

/**
 * SkipToMain — off-screen until keyboard focus. Do not use Tailwind
 * `focus:not-sr-only` alone — Android coarse-pointer min-size rules + WebView
 * focus quirks can make the link paint visibly on load.
 */
export function SkipToMain() {
  useEffect(() => {
    let queued = false;
    const sync = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        syncMainLandmark();
      });
    };

    syncMainLandmark();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document
        .querySelectorAll<HTMLElement>(`[${FALLBACK_MAIN_ATTR}="true"]`)
        .forEach(removeFallbackMain);
    };
  }, []);

  const activate = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    const target = syncMainLandmark();
    if (!target) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start', behavior: 'auto' });
  };

  return (
    <a href="#main-content" className="skip-link sr-only" onClick={activate}>
      Skip to main content
    </a>
  );
}

/**
 * LiveRegion — an aria-live region for announcing dynamic changes to
 * screen readers. Attach an id and update its textContent programmatically.
 */
export function LiveRegion() {
  return (
    <div
      id="aria-live-region"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    />
  );
}

/** Announce a message to screen readers via the live region */
export function announce(message: string) {
  const el = document.getElementById('aria-live-region');
  if (el) {
    el.textContent = '';
    // Force re-announcement by clearing then setting
    requestAnimationFrame(() => {
      el.textContent = message;
    });
  }
}
