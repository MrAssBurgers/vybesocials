import { useEffect, useRef } from 'react';

/**
 * SkipToMain — renders an invisible link that becomes visible on focus
 * and jumps the user to the main content area. Improves keyboard navigation
 * and screen-reader accessibility (WCAG 2.4.1).
 */
export function SkipToMain() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[99999] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-bold focus:shadow-lg focus:outline-none"
    >
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
