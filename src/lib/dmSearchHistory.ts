/**
 * Locally-persisted recent search terms for /messages/search.
 * Mirrors the shape of `recentMessageUsers.ts` but stores raw query text
 * instead of resolved profiles, since a search can also match conversations.
 */
export interface RecentDmSearchEntry {
  query: string;
  savedAt: number;
}

const KEY = 'vybe-messages-search-recent-v1';
const MAX = 8;

export function getRecentDmSearches(): RecentDmSearchEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is RecentDmSearchEntry =>
          !!entry &&
          typeof entry.query === 'string' &&
          entry.query.trim().length > 0 &&
          typeof entry.savedAt === 'number',
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushRecentDmSearch(query: string): RecentDmSearchEntry[] {
  const trimmed = query.trim();
  if (!trimmed) return getRecentDmSearches();
  const next = [
    { query: trimmed, savedAt: Date.now() },
    ...getRecentDmSearches().filter((entry) => entry.query.toLowerCase() !== trimmed.toLowerCase()),
  ].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* Storage can be unavailable in Safari private mode. */
  }
  return next;
}

export function removeRecentDmSearch(query: string): RecentDmSearchEntry[] {
  const next = getRecentDmSearches().filter((entry) => entry.query !== query);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function clearRecentDmSearches(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
