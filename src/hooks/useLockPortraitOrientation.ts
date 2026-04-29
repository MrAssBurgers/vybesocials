import { useEffect } from 'react';

/**
 * Locks the screen to portrait orientation while the calling component is mounted.
 *
 * Used inside VYBE Snap (camera + editor) so that rotating the phone does NOT
 * flip the UI sideways — which would invert touch gestures (swipe up → down,
 * etc.) and make stickers / text drag the wrong direction relative to the
 * still-portrait video frame.
 *
 * Falls back gracefully on browsers that don't support Screen Orientation API
 * (Safari iOS) — there nothing happens, but the rest of the app already
 * assumes portrait.
 */
export function useLockPortraitOrientation(active: boolean = true) {
  useEffect(() => {
    if (!active) return;

    const orientation: any = (window.screen as any)?.orientation;
    let locked = false;

    if (orientation && typeof orientation.lock === 'function') {
      orientation
        .lock('portrait')
        .then(() => {
          locked = true;
        })
        .catch(() => {
          // Silently ignore — not all browsers / non-fullscreen contexts allow this.
        });
    }

    return () => {
      if (locked && orientation && typeof orientation.unlock === 'function') {
        try {
          orientation.unlock();
        } catch {
          // no-op
        }
      }
    };
  }, [active]);
}
