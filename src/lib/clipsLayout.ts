/** Space reserved above bottom nav + safe area for clips action rail & captions. */
export const CLIPS_BOTTOM_UI_OFFSET =
  'calc(env(safe-area-inset-bottom, 0px) + 78px)';

/** Top chrome (Following / For You tabs + safe area). Uses the JS-measured
 * --app-header-safe var because raw env() reports 0 in some WebViews. */
export const CLIPS_TOP_UI_OFFSET =
  'calc(var(--app-header-safe, env(safe-area-inset-top, 0px)) + 48px)';

export type ClipsFeedTab = 'foryou' | 'following' | 'videos';

/** Client-side sort for the long-form Videos tab. */
export type ClipsVideoSort = 'foryou' | 'following' | 'trending' | 'recent';

const CLIPS_TAB_KEY = 'vybe-clips-feed-tab';

export function loadClipsFeedTab(): ClipsFeedTab {
  try {
    const stored = localStorage.getItem(CLIPS_TAB_KEY);
    if (stored === 'following' || stored === 'foryou' || stored === 'videos') return stored;
  } catch { /* ignore */ }
  return 'foryou';
}

export function isShortClipsTab(tab: ClipsFeedTab): boolean {
  return tab === 'foryou' || tab === 'following';
}

export function saveClipsFeedTab(tab: ClipsFeedTab): void {
  try {
    localStorage.setItem(CLIPS_TAB_KEY, tab);
  } catch { /* ignore */ }
}
