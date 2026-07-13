/**
 * Persist selected Messages filter + per-filter scroll positions locally.
 */
import type { DmInboxFilterId } from '@/features/dms/dm.types';
import { DM_INBOX_FILTERS } from '@/lib/dmInboxOrganize';

const FILTER_KEY = 'vybe-dm-inbox-filter';
const SCROLL_KEY = 'vybe-dm-inbox-scroll';
const FILTER_PREFS_KEY = 'vybe-dm-inbox-filter-prefs';

export function readStoredInboxFilter(): DmInboxFilterId {
  if (typeof sessionStorage === 'undefined') return 'all';
  try {
    const stored = sessionStorage.getItem(FILTER_KEY);
    if (stored && (DM_INBOX_FILTERS as string[]).includes(stored)) {
      return stored as DmInboxFilterId;
    }
    // Migrate legacy tab ids
    if (stored === 'friends' || stored === 'best_friends' || stored === 'nearby' || stored === 'requests') {
      return 'all';
    }
    if (stored === 'calls') return 'unread';
  } catch {
    /* ignore */
  }
  return 'all';
}

export function writeStoredInboxFilter(filter: DmInboxFilterId): void {
  try {
    sessionStorage.setItem(FILTER_KEY, filter);
  } catch {
    /* ignore */
  }
}

export function readFilterScrollMap(): Record<string, number> {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeFilterScroll(filter: string, scrollTop: number): void {
  try {
    const map = readFilterScrollMap();
    map[filter] = Math.max(0, Math.round(scrollTop));
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

const pendingScrollWrites = new Map<string, number>();
let scrollWriteRaf = 0;

/** Throttled scroll persistence — never parse/stringify every scroll frame. */
export function writeFilterScrollThrottled(filter: string, scrollTop: number): void {
  pendingScrollWrites.set(filter, Math.max(0, Math.round(scrollTop)));
  if (scrollWriteRaf) return;
  scrollWriteRaf = requestAnimationFrame(() => {
    scrollWriteRaf = 0;
    const entries = [...pendingScrollWrites.entries()];
    pendingScrollWrites.clear();
    try {
      const map = readFilterScrollMap();
      for (const [key, top] of entries) {
        map[key] = top;
      }
      sessionStorage.setItem(SCROLL_KEY, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  });
}

export function readFilterScroll(filter: string): number {
  return readFilterScrollMap()[filter] || 0;
}

export interface DmFilterPrefs {
  order: DmInboxFilterId[];
  hidden: DmInboxFilterId[];
}

export function readFilterPrefs(profileId?: string | null): DmFilterPrefs {
  const fallback: DmFilterPrefs = { order: [...DM_INBOX_FILTERS], hidden: [] };
  if (typeof localStorage === 'undefined' || !profileId) return fallback;
  try {
    const raw = localStorage.getItem(`${FILTER_PREFS_KEY}:${profileId}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as DmFilterPrefs;
    const order = Array.isArray(parsed.order)
      ? parsed.order.filter((id): id is DmInboxFilterId =>
          (DM_INBOX_FILTERS as string[]).includes(id),
        )
      : fallback.order;
    const hidden = Array.isArray(parsed.hidden)
      ? parsed.hidden.filter((id): id is DmInboxFilterId =>
          (DM_INBOX_FILTERS as string[]).includes(id),
        )
      : [];
    return {
      order: order.length ? order : fallback.order,
      hidden,
    };
  } catch {
    return fallback;
  }
}

export function writeFilterPrefs(profileId: string, prefs: DmFilterPrefs): void {
  try {
    localStorage.setItem(`${FILTER_PREFS_KEY}:${profileId}`, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function visibleFiltersForProfile(profileId?: string | null): DmInboxFilterId[] {
  const prefs = readFilterPrefs(profileId);
  const hidden = new Set(prefs.hidden);
  const ordered = prefs.order.filter((id) => !hidden.has(id));
  for (const id of DM_INBOX_FILTERS) {
    if (!ordered.includes(id) && !hidden.has(id)) ordered.push(id);
  }
  return ordered;
}
