import { useEffect, useRef } from 'react';

/**
 * SkipToMain — off-screen until keyboard focus. Do not use Tailwind
 * `focus:not-sr-only` alone — Android coarse-pointer min-size rules + WebView
 * focus quirks can make the link paint visibly on load.
 */
export function SkipToMain() {
  return (
    <a href="#main-content" className="skip-link sr-only">
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
