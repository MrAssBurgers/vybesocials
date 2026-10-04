import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';
import { mustPersistAsArray, revivePersistedClient } from '@/lib/persistedCollections';
import { isStoriesQueryKey, sanitizeStoriesCacheData } from '@/lib/storiesCacheSanitize';

// Moderator notes, reporter identities and inspected source must be fetched
// under current server authority, never restored from a previous disk snapshot.
const PRIVATE_REPORT_KEYS = new Set(['admin-reports', 'report-inspection', 'pending-moderation-count', 'post-deletion-log', 'feed-mutes', 'custom-sounds', 'social-feed', 'personalized-feed-v2', 'personalized-feed', 'infinite-following-posts']);
// The disk cache is shared by all accounts on this browser. Private conversation
// previews, message bodies and their related records need current membership;
// neither a user-shaped query key nor a previous successful read proves it.
const PRIVATE_DM_KEYS = new Set([
  'dm-conversations', 'conversations', 'conversation-detail', 'conversation',
  'messages', 'chat-search', 'message-transcript', 'message-pins', 'message-requests',
  'conversation-offers', 'scheduled-messages', 'vanish-messages', 'vanish-threads',
  'trashed-conversations', 'dm-reminders', 'word-reactions',
]);
// Community metadata can include private names, invitations, members and media.
// Disk snapshots cannot prove today's admission or channel permission.
const PRIVATE_COMMUNITY_KEYS = new Set([
  'my-servers', 'my-communities', 'server', 'community', 'channels', 'rooms',
  'server-members', 'community-members', 'channel-messages', 'channel-permissions',
  'my-channel-permissions', 'my-server-role', 'my-community-role', 'live-activity',
  'server-member-count', 'all-server-member-counts', 'unread-per-server', 'unread-per-channel',
  'unread-server-notifications-count',
]);
const PRIVATE_STORY_KEYS = new Set(['stories', 'visible-story', 'story-author', 'friend-profile-stories', 'story-highlights', 'close-friends', 'close-friend-ids', 'story-likes', 'story-views', 'story-polls', 'story-poll-votes']);
// Profile sections depend on the current viewer and fresh audience decisions.
const PRIVATE_PROFILE_KEYS = new Set(['profile', 'profile-by-id', 'profile-by-username', 'profile-view-identity', 'profile-view-request', 'profile-visibility-resolved', 'profile-visibility-settings', 'profile-section', 'profile-blocked-pair', 'profile-view-level', 'profile-view-friends-count', 'profile-cover-bg', 'profile-friends-list', 'follow-list', 'follow-authority', 'follow-management', 'tagged-posts']);
const isPrivatePersistedKey = (key?: readonly unknown[]) => typeof key?.[0] === 'string'
  && (PRIVATE_REPORT_KEYS.has(key[0]) || PRIVATE_DM_KEYS.has(key[0]) || PRIVATE_COMMUNITY_KEYS.has(key[0]) || PRIVATE_STORY_KEYS.has(key[0]) || PRIVATE_PROFILE_KEYS.has(key[0]) || (key[0] === 'posts' && key[1] === 'profile-server-v2'));

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

/** Minimal valid client — used when the persisted cache is corrupt. */
function emptyPersistedClient(): PersistedClient {
  return {
    timestamp: 0,
    buster: '',
    clientState: { mutations: [], queries: [] },
  };
}

function deserializePersistedClient(cached: string): PersistedClient {
  try {
    const parsed = JSON.parse(cached) as PersistedClient;
    if (!parsed || typeof parsed !== 'object' || !parsed.clientState) {
      return emptyPersistedClient();
    }
    // Filter old snapshots before revival can normalize their member/profile
    // data. This also migrates caches written before private queries were denied.
    const queries = parsed.clientState.queries;
    if (!Array.isArray(queries)) return emptyPersistedClient();
    return revivePersistedClient({ ...parsed, clientState: { ...parsed.clientState,
      queries: queries.filter(entry => !isPrivatePersistedKey(entry?.queryKey)),
    } });
  } catch {
    // Corrupt persisted cache (truncated write, quota kill, bad JSON) must not
    // throw at boot — a stale-but-empty cache beats a white screen. Drop it so
    // the next persist writes a clean snapshot.
    void idbStorage.removeItem('vybe-react-query-cache');
    return emptyPersistedClient();
  }
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
      queries: queries.filter(entry => !isPrivatePersistedKey(entry?.queryKey)).map((entry) => {
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
  // Conversation lists and other private message roots are also denied above,
  // including during restore of snapshots written by older app versions.
  'messages',
  'unread-messages',
  'unread-messages-count',
  // Equipped Vybe lives in localStorage (vybe-equipped-theme*); persisting user-theme
  // replays stale DB rows over the boot-painted theme and causes a visible flash.
  'user-theme',
];

// Keys whose persisted snapshot must be non-empty to be worth replaying.
const NON_EMPTY_ONLY_FRAGMENTS = [
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
    if (isPrivatePersistedKey(queryKey)) return false;
    const flat = JSON.stringify(queryKey).toLowerCase();
    if (EPHEMERAL_KEY_FRAGMENTS.some((f) => flat.includes(f))) return false;
    if (NON_EMPTY_ONLY_FRAGMENTS.some((f) => flat.includes(f))) {
      if (Array.isArray(data)) return data.length > 0;
      if (flat.includes('feed') || flat.includes('infinite-posts') || flat.includes('following')) {
        return hasPersistableFeedPages(data);
      }
      // List-shaped keys must stay arrays — object snapshots crash render.
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
