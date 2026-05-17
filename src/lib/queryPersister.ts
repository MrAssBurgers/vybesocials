import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';

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

export const queryPersister = createAsyncStoragePersister({
  storage: idbStorage,
  key: 'vybe-react-query-cache',
  throttleTime: 1500,
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
  // DM / chat data must NOT be persisted to IndexedDB — replaying stale
  // offline snapshots on app boot was causing the DM list to flash empty
  // / out-of-date conversations before the live refetch landed.
  'dm-conversations',
  'conversations',
  'messages',
  'unread-messages',
  'unread-messages-count',
];

export function shouldPersistQueryKey(queryKey: readonly unknown[]): boolean {
  try {
    const flat = JSON.stringify(queryKey).toLowerCase();
    return !EPHEMERAL_KEY_FRAGMENTS.some((f) => flat.includes(f));
  } catch {
    return false;
  }
}
