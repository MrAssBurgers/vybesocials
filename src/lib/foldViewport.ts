/**
 * Galaxy Z Fold layout viewport.
 * Chrome will not recompute device-width on unfold when maximum-scale / user-scalable=no
 * lock the initial scale. Fold 8 inner is ~933×704 CSS px at 420dpi; some shells report
 * ≥1024 and would pick the desktop breakpoint. Cap only that case, and release on the cover.
 */

export const FOLD_TOUCH_VIEWPORT = 'width=device-width, initial-scale=1.0, viewport-fit=cover';

export const FOLD_CAPPED_VIEWPORT = 'width=1000, initial-scale=1, viewport-fit=cover';

/** Desktop Tailwind breakpoint. Unfolded shells at or above this get sidebars. */
export const FOLD_DESKTOP_CSS_PX = 1024;

/** Cover screens sit well under this. A capped inner viewport stays near 1000. */
export const FOLD_COVER_MAX_CSS_PX = 900;

export function nextFoldViewport(
  deviceCssWidth: number,
  capping: boolean,
): { content: string; capping: boolean } {
  // While capped, pass screen.width / devicePixelRatio. innerWidth stays ~1000
  // and would never look like the cover screen.
  if (deviceCssWidth >= FOLD_DESKTOP_CSS_PX && !capping) {
    return { content: FOLD_CAPPED_VIEWPORT, capping: true };
  }
  if (capping && deviceCssWidth < FOLD_COVER_MAX_CSS_PX) {
    return { content: FOLD_TOUCH_VIEWPORT, capping: false };
  }
  if (!capping) {
    return { content: FOLD_TOUCH_VIEWPORT, capping: false };
  }
  return { content: FOLD_CAPPED_VIEWPORT, capping: true };
}
