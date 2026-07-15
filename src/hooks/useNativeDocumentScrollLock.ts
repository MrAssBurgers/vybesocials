import { useEffect } from 'react';
import { isIOSAppShell, isNativeAppShell } from '@/lib/despiaBridge';

/**
 * Lock document-level scroll on native shells so WKWebView cannot rubber-band
 * the whole app chrome. Inner panes (#main-content, .dm-inbox-list, etc.) keep scrolling.
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
      bodyPosition: body.style.position,
      bodyWidth: body.style.width,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyHeight: body.style.height,
      bodyTouch: body.style.touchAction,
    };

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';
    body.style.touchAction = 'manipulation';

    // iOS WKWebView: fixed body is the reliable kill for document rubber-band.
    if (isIOSAppShell()) {
      body.style.position = 'fixed';
      body.style.width = '100%';
      body.style.top = '0';
      body.style.left = '0';
      body.style.height = '100%';
    }

    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      body.style.position = prev.bodyPosition;
      body.style.width = prev.bodyWidth;
      body.style.top = prev.bodyTop;
      body.style.left = prev.bodyLeft;
      body.style.height = prev.bodyHeight;
      body.style.touchAction = prev.bodyTouch;
    };
  }, [enabled]);
}
