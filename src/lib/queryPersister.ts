import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';
import { mustPersistAsArray, revivePersistedClient } from '@/lib/persistedCollections';
import { isStoriesQueryKey, sanitizeStoriesCacheData } from '@/lib/storiesCacheSanitize';

/**
 * IndexedDB-backed storage adapter for react-query persistence.
 * Larger and faster than localStorage; survives across sessions.
 */
const idbStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const value = await get<string>(key);
      return value ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await set(key, value);
    } catch {
      // Quota exceeded / private mode — silently skip
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await del(key);
    } catch {
      // ignore
    }
  },
};

function deserializePersistedClient(cached: string): PersistedClient {
  const parsed = JSON.parse(cached) as PersistedClient;
  return revivePersistedClient(parsed);
}

function serializePersistedClient(client: PersistedClient): string {
  const queries = client?.clientState?.queries;
  if (!Array.isArray(queries)) {
    return JSON.stringify(client);
  }

  const sanitized: PersistedClient = {
    ...client,
    clientState: {
      ...client.clientState,
      queries: queries.map((entry) => {
        if (!entry?.queryKey || !isStoriesQueryKey(entry.queryKey)) return entry;
        const data = entry.state?.data;
        if (data == null) return entry;
        const cleaned = sanitizeStoriesCacheData(data);
        if (cleaned === data) return entry;
        return {
          ...entry,
          state: { ...entry.state, data: cleaned },
        };
      }),
    },
  };

  return JSON.stringify(sanitized);
}

export const queryPersister = createAsyncStoragePersister({
  storage: idbStorage,
  key: 'vybe-react-query-cache',
  throttleTime: 800,
  serialize: serializePersistedClient,
  deserialize: deserializePersistedClient,
});

/**
 * Skip persistence for queries that are ephemeral, sensitive, or
 * meaningless when stale (auth tokens, signed URLs, presence, live data).
 */
const EPHEMERAL_KEY_FRAGMENTS = [
  'realtime',
  'presence',
  'signed-url',
  'signed_url',
  'live',
  'token',
  'session',
  'typing',
  'call',
  'spotify-now-playing',
  'audio-features',
  // Per-thread message history & unread counters stay ephemeral — replaying
  // stale snapshots caused wrong message ordering / wrong unread badges.
  // NOTE: the DM conversation LIST ('dm-conversations') is intentionally
  // allowed through so /messages hydrates instantly on cold start. We gate
  // it on non-empty data below to avoid the empty-flash regression.
  'messages',
  'unread-messages',
  'unread-messages-count',
];

// Keys whose persisted snapshot must be non-empty to be worth replaying.
const NON_EMPTY_ONLY_FRAGMENTS = [
  'dm-conversations',
  'conversations',
  'personalized-feed',
  'infinite-following-posts',
  'infinite-posts',
  'local-feed',
];

function hasPersistableFeedPages(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const pages = (data as { pages?: unknown[] }).pages;
  if (!Array.isArray(pages) || pages.length === 0) return false;
  return pages.some((page) => {
    const posts = (page as { posts?: unknown[] })?.posts;
    return Array.isArray(posts) && posts.length > 0;
  });
}

export function shouldPersistQueryKey(queryKey: readonly unknown[], data?: unknown): boolean {
  try {
    const flat = JSON.stringify(queryKey).toLowerCase();
    if (EPHEMERAL_KEY_FRAGMENTS.some((f) => flat.includes(f))) return false;
    if (NON_EMPTY_ONLY_FRAGMENTS.some((f) => flat.includes(f))) {
      if (Array.isArray(data)) return data.length > 0;
      if (flat.includes('feed') || flat.includes('infinite-posts') || flat.includes('following')) {
        return hasPersistableFeedPages(data);
      }
      // List-shaped keys (dm-conversations, etc.) must stay arrays — object snapshots crash render.
      return false;
    }
    if (mustPersistAsArray(queryKey)) {
      return Array.isArray(data);
    }
    return true;
  } catch {
    return false;
  }
}
