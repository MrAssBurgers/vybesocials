import type { QueryClient } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { sanitizeStoriesCacheData, isStoriesQueryKey } from '@/lib/storiesCacheSanitize';

/** Rehydrated React Query cache can deserialize Set/Map as plain objects. */

export function normalizePersistedSet(data: unknown): Set<string> {
  if (data instanceof Set) return data as Set<string>;
  if (Array.isArray(data)) {
    return new Set<string>(data.filter((v): v is string => typeof v === 'string'));
  }
  if (data && typeof data === 'object') {
    return new Set<string>(
      Object.values(data as Record<string, unknown>).filter((v): v is string => typeof v === 'string'),
    );
  }
  return new Set<string>();
}

export function normalizePersistedMap<V>(data: unknown): Map<string, V> {
  if (data instanceof Map) return data as Map<string, V>;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const map = new Map<string, V>();
    for (const [key, value] of Object.entries(data as Record<string, V>)) {
      if (typeof key === 'string' && value != null) map.set(key, value);
    }
    return map;
  }
  return new Map<string, V>();
}

/** Query keys whose cached `data` must be a Set after persistence restore. */
const PERSISTED_SET_KEY_FRAGMENTS = [
  'outgoing-request-ids',
  'hidden-from-discovery',
  'dismissed-profiles',
  'trashed-conversation-ids',
  'hidden-conversations',
  'my-feature-votes',
  'viewed-story-ids',
  'easter-eggs-unlocked',
];

/** Query keys whose cached `data` must be a Map after persistence restore. */
const PERSISTED_MAP_KEY_FRAGMENTS = [
  'user-statuses-batch',
];

/** Root query-key segments that must deserialize as arrays after persistence restore. */
const PERSISTED_ARRAY_QUERY_ROOTS = new Set([
  'dm-conversations',
  'conversations',
  'stories',
  'streaks',
  'friends',
  'vybe-pass-tiers',
  'challenges',
  'claimed-rewards',
  'challenge-progress',
  'trashed-conversations',
  'accepted-friend-requests',
  'friend-requests',
  'friends-notes',
]);

/** Query keys that should never hydrate as a plain object (IDB array → `{}`). */
const PERSISTED_ARRAY_KEY_FRAGMENTS = [
  'dm-conversations',
  'conversations',
  'stories',
  'streaks',
  'friends',
  'accepted-friend-requests',
  'friend-requests',
  'friends-notes',
  'vybe-pass-tiers',
  'challenges',
  'claimed-rewards',
  'challenge-progress',
  'trashed-conversations',
];

export function ensureArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  if (data == null) return [];
  if (typeof data === 'object') {
    const values = Object.values(data as Record<string, unknown>);
    if (!values.length) return [];
    const keys = Object.keys(data as object);
    const looksLikeArray =
      keys.length === values.length && keys.every((k) => /^\d+$/.test(k));
    if (looksLikeArray || values.every((v) => v != null && typeof v === 'object')) {
      return values as T[];
    }
  }
  return [];
}

/** DM member rows — persisted cache can deserialize `members` as `{}`. */
export function safeDmMembers<T = unknown>(members: unknown): T[] {
  return ensureArray<T>(members);
}

/** React Query cache can deserialize list queries as `{}` — never call `.find` on raw cache. */
export function readQueryArray<T>(data: unknown): T[] {
  return ensureArray<T>(data);
}

export function findInQueryArray<T>(
  data: unknown,
  predicate: (item: T, index: number) => boolean,
): T | undefined {
  return ensureArray<T>(data).find(predicate);
}

/** DM rows: persisted cache can deserialize members as `{}` — breaks .filter / for…of in ChatView. */
export function normalizeDmConversation<T extends { members?: unknown; last_message?: unknown }>(conv: T): T {
  if (!conv || typeof conv !== 'object') return conv;
  let next = conv;
  if (conv.members != null && !Array.isArray(conv.members)) {
    next = { ...next, members: ensureArray(conv.members) };
  }
  const lm = conv.last_message;
  if (lm != null && typeof lm === 'object' && !Array.isArray(lm)) {
    const row = lm as Record<string, unknown>;
    next = {
      ...next,
      last_message: {
        ...row,
        content: typeof row.content === 'string' ? row.content : null,
        message_type: typeof row.message_type === 'string' ? row.message_type : null,
        media_type: typeof row.media_type === 'string' ? row.media_type : null,
        sender_id: typeof row.sender_id === 'string' ? row.sender_id : null,
        created_at: typeof row.created_at === 'string' ? row.created_at : null,
      },
    };
  }
  return next;
}

export function normalizeDmConversationList<T extends { members?: unknown }>(list: unknown): T[] {
  const rows = ensureArray<T>(list);
  if (!rows.length) return rows;
  const needsFix = !Array.isArray(list) || rows.some((c) => c?.members != null && !Array.isArray(c.members));
  if (!needsFix) return rows;
  return rows.map((c) => normalizeDmConversation(c));
}

export function normalizePersistedArray<T>(data: unknown): T[] {
  return ensureArray<T>(data);
}

function isPersistedArrayQueryKey(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  return typeof root === 'string' && PERSISTED_ARRAY_QUERY_ROOTS.has(root);
}

function queryKeyMatchesFragments(queryKey: readonly unknown[], fragments: string[]): boolean {
  try {
    const flat = JSON.stringify(queryKey).toLowerCase();
    return fragments.some((f) => flat.includes(f));
  } catch {
    return false;
  }
}

/** Revive Set/Map query data based on query key patterns. */
export function revivePersistedQueryData(queryKey: readonly unknown[], data: unknown): unknown {
  if (data == null) return data;
  if (isStoriesQueryKey(queryKey)) {
    return sanitizeStoriesCacheData(data);
  }
  if (queryKeyMatchesFragments(queryKey, PERSISTED_SET_KEY_FRAGMENTS)) {
    return normalizePersistedSet(data);
  }
  if (queryKeyMatchesFragments(queryKey, PERSISTED_MAP_KEY_FRAGMENTS)) {
    return normalizePersistedMap(data);
  }
  if (isPersistedArrayQueryKey(queryKey)) {
    const root = queryKey[0];
    if (root === 'dm-conversations' || root === 'conversations') {
      return normalizeDmConversationList(data);
    }
    return normalizePersistedArray(data);
  }
  if (queryKey[0] === 'conversation-detail' && data && typeof data === 'object') {
    return normalizeDmConversation(data as { members?: unknown });
  }
  if (queryKey[0] === 'messages') {
    const arr = ensureArray(data);
    if (!arr.length) return arr;
    const needsFix =
      !Array.isArray(data) ||
      arr.some(
        (m) =>
          m &&
          typeof m === 'object' &&
          (!Array.isArray((m as { views?: unknown }).views) ||
            !Array.isArray((m as { reactions?: unknown }).reactions)),
      );
    if (!needsFix) return arr;
    return arr.map((m) => ({
      ...(m as object),
      views: Array.isArray((m as { views?: unknown }).views) ? (m as { views: unknown[] }).views : [],
      reactions: Array.isArray((m as { reactions?: unknown }).reactions)
        ? (m as { reactions: unknown[] }).reactions
        : [],
    }));
  }
  if (queryKeyMatchesFragments(queryKey, PERSISTED_ARRAY_KEY_FRAGMENTS)) {
    return ensureArray(data);
  }
  return data;
}

/** Walk dehydrated persist blob and revive all Set/Map entries. */
export function revivePersistedClient(client: PersistedClient): PersistedClient {
  const queries = client?.clientState?.queries;
  if (!Array.isArray(queries)) return client;

  return {
    ...client,
    clientState: {
      ...client.clientState,
      queries: queries.map((entry) => {
        const data = entry?.state?.data;
        if (data == null) return entry;
        const revived = revivePersistedQueryData(entry.queryKey, data);
        if (revived === data) return entry;
        return {
          ...entry,
          state: { ...entry.state, data: revived },
        };
      }),
    },
  };
}

/** Belt-and-suspenders: re-normalize live cache after persist restore. */
export function reviveQueriesInCache(queryClient: QueryClient): void {
  for (const query of queryClient.getQueryCache().getAll()) {
    const data = query.state.data;
    if (data == null) continue;
    const revived = revivePersistedQueryData(query.queryKey, data);
    if (revived !== data) {
      queryClient.setQueryData(query.queryKey, revived);
    }
  }
}

/** Defensive read when a consumer might bypass query `select`. */
export function safeSetHas(set: unknown, value: string): boolean {
  return normalizePersistedSet(set).has(value);
}

/** Defensive read when a consumer might bypass query `select`. */
export function safeMapGet<V>(map: unknown, key: string): V | undefined {
  return normalizePersistedMap<V>(map).get(key);
}

/**
 * Normalize query cache entries after persistence restore or corrupt snapshots.
 * Subscribe once at app boot so consumers never see plain-object Maps/Sets/arrays.
 */
function queryKeyNeedsRevive(queryKey: readonly unknown[]): boolean {
  if (isStoriesQueryKey(queryKey)) return true;
  if (queryKeyMatchesFragments(queryKey, PERSISTED_SET_KEY_FRAGMENTS)) return true;
  if (queryKeyMatchesFragments(queryKey, PERSISTED_MAP_KEY_FRAGMENTS)) return true;
  if (queryKeyMatchesFragments(queryKey, PERSISTED_ARRAY_KEY_FRAGMENTS)) return true;
  if (isPersistedArrayQueryKey(queryKey)) return true;
  const root = queryKey[0];
  return root === 'conversation-detail' || root === 'messages';
}

export function installQueryCacheNormalizer(queryClient: QueryClient): () => void {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event?.type !== 'updated' && event?.type !== 'added') return;
    const query = event.query;
    const data = query.state.data;
    if (data == null) return;
    const revived = revivePersistedQueryData(query.queryKey, data);
    if (revived !== data) {
      queryClient.setQueryData(query.queryKey, revived);
    }
  });
}

/**
 * Normalize on every `setQueryData` for DM/stories/Set/Map keys so corrupt
 * snapshots never reach render (optional chaining does not guard `{}`).
 */
export function installQueryCacheWriteGuard(queryClient: QueryClient): void {
  const original = queryClient.setQueryData.bind(queryClient);
  let guarding = false;

  queryClient.setQueryData = ((queryKey, updater, options) => {
    if (guarding || !queryKeyNeedsRevive(queryKey)) {
      return original(queryKey, updater, options);
    }

    guarding = true;
    try {
      if (typeof updater === 'function') {
        return original(
          queryKey,
          (old) => {
            const normalizedOld = revivePersistedQueryData(queryKey, old);
            const next = updater(normalizedOld);
            return revivePersistedQueryData(queryKey, next);
          },
          options,
        );
      }
      return original(queryKey, revivePersistedQueryData(queryKey, updater), options);
    } finally {
      guarding = false;
    }
  }) as typeof queryClient.setQueryData;
}
