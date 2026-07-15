import { useEffect } from 'react';
import { isNativeAppShell } from '@/lib/despiaBridge';

/**
 * Lock document-level scroll on native shells so WKWebView cannot rubber-band
 * the whole app chrome. Inner panes (#main-content, .dm-inbox-list, etc.) keep scrolling.
 *
 * Do NOT set body position:fixed — that shrinks the WebView viewport on iOS and
 * leaves gaps at the top/bottom (wallpaper showing through).
 */
export function useNativeDocumentScrollLock(enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof document === 'undefined' || !isNativeAppShell()) return;

    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
      htmlHeight: html.style.height,
      bodyHeight: body.style.height,
      bodyTouch: body.style.touchAction,
    };

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';
    html.style.height = '100%';
    body.style.height = '100%';
    body.style.touchAction = 'manipulation';

    // #region agent log
    fetch('http://127.0.0.1:7693/ingest/1847f3ab-7d03-4b99-8dbe-84076ae9145e', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'adb115' },
      body: JSON.stringify({
        sessionId: 'adb115',
        runId: 'ios-ux',
        hypothesisId: 'S1',
        location: 'useNativeDocumentScrollLock.ts',
        message: 'scroll_lock_no_fixed',
        data: {
          innerH: window.innerHeight,
          docH: document.documentElement.clientHeight,
          bodyPos: getComputedStyle(body).position,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      html.style.height = prev.htmlHeight;
      body.style.height = prev.bodyHeight;
      body.style.touchAction = prev.bodyTouch;
    };
  }, [enabled]);
}
