import type { QueryClient } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { sanitizeStoriesCacheData, isStoriesQueryKey, storyGroupsNeedRevive } from '@/lib/storiesCacheSanitize';
import { enrichProfileAvatar } from '@/lib/profileAvatarCache';

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
  'locked-chats',
  'inbox-call-conversations',
  'recent-new-friend-ids',
];

/** Query keys whose cached `data` must be a Map after persistence restore. */
const PERSISTED_MAP_KEY_FRAGMENTS = [
  'user-statuses-batch',
  'inbox-call-summaries',
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

export function ensureArray<T = any>(data: unknown): T[] {
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

/**
 * React Query persistence turns `Set` into `{}` — never call `.has` on raw cache data.
 * Accepts Set, string[], or object-map keys.
 */
export function ensureStringSet(data: unknown): Set<string> {
  if (data instanceof Set) {
    return new Set(
      [...data].map((value) => String(value)).filter(Boolean),
    );
  }
  if (Array.isArray(data)) {
    return new Set(data.map((value) => String(value)).filter(Boolean));
  }
  if (data && typeof data === 'object') {
    const values = Object.values(data as Record<string, unknown>);
    // Persisted empty Set often becomes {}.
    if (!values.length) return new Set();
    // Array-like object of strings
    if (values.every((value) => typeof value === 'string' || typeof value === 'number')) {
      return new Set(values.map((value) => String(value)).filter(Boolean));
    }
  }
  return new Set();
}

/** DM member rows — persisted cache can deserialize `members` as `{}`. */
export function safeDmMembers<T = any>(members: unknown): T[] {
  return ensureArray<T>(members);
}

/** React Query cache can deserialize list queries as `{}` — never call `.find` on raw cache. */
export function readQueryArray<T = any>(data: unknown): T[] {
  return ensureArray<T>(data);
}

export function findInQueryArray<T = any>(
  data: unknown,
  predicate: (item: T, index: number) => boolean,
): T | undefined {
  return ensureArray<T>(data).find(predicate);
}

/** DM rows: persisted cache can deserialize members as `{}` — breaks .filter / for…of in ChatView. */
export function dmConversationNeedsRevive(conv: unknown): boolean {
  if (!conv || typeof conv !== 'object' || Array.isArray(conv)) return false;
  const row = conv as { members?: unknown; name?: unknown; last_message?: unknown };
  if (row.members != null && !Array.isArray(row.members)) return true;
  if (row.name != null && typeof row.name !== 'string') return true;
  const lm = row.last_message;
  if (lm != null && typeof lm === 'object' && !Array.isArray(lm)) {
    const last = lm as Record<string, unknown>;
    if (last.content != null && typeof last.content !== 'string') return true;
    if (last.message_type != null && typeof last.message_type !== 'string') return true;
    if (last.media_type != null && typeof last.media_type !== 'string') return true;
    if (last.sender_id != null && typeof last.sender_id !== 'string') return true;
    if (last.created_at != null && typeof last.created_at !== 'string') return true;
  }
  return false;
}

export function dmConversationListNeedsRevive(list: unknown): boolean {
  if (!Array.isArray(list)) return list != null && typeof list === 'object';
  return list.some(dmConversationNeedsRevive);
}

export function normalizeDmConversation<T extends { members?: unknown; last_message?: unknown; name?: unknown }>(conv: T): T {
  if (!conv || typeof conv !== 'object') return conv;
  let next = conv;
  if (conv.members != null && !Array.isArray(conv.members)) {
    next = { ...next, members: ensureArray(conv.members) };
  }
  if (Array.isArray(next.members)) {
    const members = next.members.map((m) => {
      if (!m || typeof m !== 'object') return m;
      const row = m as { profile?: { id?: string; avatar_url?: string | null } | null };
      if (!row.profile) return m;
      const enriched = enrichProfileAvatar(row.profile);
      if (enriched === row.profile) return m;
      return { ...row, profile: enriched };
    });
    next = { ...next, members };
  }
  if (conv.name != null && typeof conv.name !== 'string') {
    next = { ...next, name: null };
  }
  const lm = conv.last_message;
  if (lm != null && typeof lm === 'object' && !Array.isArray(lm)) {
    const row = lm as Record<string, unknown>;
    const normalizedLast = {
      ...row,
      content: typeof row.content === 'string' ? row.content : null,
      message_type: typeof row.message_type === 'string' ? row.message_type : null,
      media_type: typeof row.media_type === 'string' ? row.media_type : null,
      sender_id: typeof row.sender_id === 'string' ? row.sender_id : null,
      created_at: typeof row.created_at === 'string' ? row.created_at : null,
    };
    const lastChanged =
      row.content !== normalizedLast.content ||
      row.message_type !== normalizedLast.message_type ||
      row.media_type !== normalizedLast.media_type ||
      row.sender_id !== normalizedLast.sender_id ||
      row.created_at !== normalizedLast.created_at;
    if (lastChanged) {
      next = { ...next, last_message: normalizedLast };
    }
  }
  return next;
}

export function normalizeDmConversationList<T extends { members?: unknown }>(list: unknown): T[] {
  const rows = ensureArray<T>(list);
  if (!rows.length) return rows;
  if (!dmConversationListNeedsRevive(rows)) return rows;

  let changed = false;
  const next = rows.map((c) => {
    const normalized = normalizeDmConversation(c);
    if (normalized !== c) changed = true;
    return normalized;
  });
  return changed ? next : rows;
}

export function normalizePersistedArray<T>(data: unknown): T[] {
  return ensureArray<T>(data);
}

function isPersistedArrayQueryKey(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  return typeof root === 'string' && PERSISTED_ARRAY_QUERY_ROOTS.has(root);
}

/** List-shaped query keys must never be persisted as plain objects (IDB → `{}` crash on .map). */
export function mustPersistAsArray(queryKey: readonly unknown[]): boolean {
  return (
    isPersistedArrayQueryKey(queryKey) ||
    queryKeyMatchesFragments(queryKey, PERSISTED_ARRAY_KEY_FRAGMENTS)
  );
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
    let changed = false;
    const next = arr.map((m) => {
      if (!m || typeof m !== 'object') return m;
      const row = m as { views?: unknown; reactions?: unknown };
      const views = Array.isArray(row.views) ? row.views : [];
      const reactions = Array.isArray(row.reactions) ? row.reactions : [];
      if (Array.isArray(row.views) && Array.isArray(row.reactions)) return m;
      changed = true;
      return { ...(m as object), views, reactions };
    });
    return changed ? next : arr;
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

export function reviveQueriesInCache(queryClient: QueryClient): void {
  let normalizing = false;
  for (const query of queryClient.getQueryCache().getAll()) {
    if (normalizing) break;
    const data = query.state.data;
    if (data == null) continue;
    const revived = revivePersistedQueryData(query.queryKey, data);
    if (revived === data) continue;
    normalizing = true;
    try {
      queryClient.setQueryData(query.queryKey, revived);
    } finally {
      normalizing = false;
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
  let normalizing = false;

  return queryClient.getQueryCache().subscribe((event) => {
    if (normalizing) return;
    if (event?.type !== 'updated' && event?.type !== 'added') return;
    const query = event.query;
    const data = query.state.data;
    if (data == null) return;
    let revived: unknown;
    try {
      revived = revivePersistedQueryData(query.queryKey, data);
    } catch {
      queryClient.removeQueries({ queryKey: query.queryKey, exact: true });
      return;
    }
    if (revived === data) return;

    normalizing = true;
    try {
      queryClient.setQueryData(query.queryKey, revived);
    } finally {
      normalizing = false;
    }
  });
}

function queryDataNeedsRevive(queryKey: readonly unknown[], data: unknown): boolean {
  if (data == null) return false;
  if (isStoriesQueryKey(queryKey)) return storyGroupsNeedRevive(data);
  if (queryKeyMatchesFragments(queryKey, PERSISTED_SET_KEY_FRAGMENTS)) {
    return !(data instanceof Set);
  }
  if (queryKeyMatchesFragments(queryKey, PERSISTED_MAP_KEY_FRAGMENTS)) {
    return !(data instanceof Map);
  }
  const root = queryKey[0];
  if (root === 'dm-conversations' || root === 'conversations') {
    return dmConversationListNeedsRevive(data);
  }
  if (root === 'conversation-detail') {
    return dmConversationNeedsRevive(data);
  }
  if (root === 'messages') {
    if (!Array.isArray(data)) return true;
    return data.some(
      (m) =>
        m &&
        typeof m === 'object' &&
        (!Array.isArray((m as { views?: unknown }).views) ||
          !Array.isArray((m as { reactions?: unknown }).reactions)),
    );
  }
  if (isPersistedArrayQueryKey(queryKey) || queryKeyMatchesFragments(queryKey, PERSISTED_ARRAY_KEY_FRAGMENTS)) {
    return !Array.isArray(data);
  }
  return false;
}

/**
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
            const base = queryDataNeedsRevive(queryKey, old)
              ? revivePersistedQueryData(queryKey, old)
              : old;
            const next = (updater as (input: unknown) => unknown)(base);
            if (next === base) return base;
            return queryDataNeedsRevive(queryKey, next)
              ? revivePersistedQueryData(queryKey, next)
              : next;
          },
          options,
        );
      }
      return original(
        queryKey,
        queryDataNeedsRevive(queryKey, updater)
          ? revivePersistedQueryData(queryKey, updater)
          : updater,
        options,
      );
    } finally {
      guarding = false;
    }
  }) as typeof queryClient.setQueryData;
}
