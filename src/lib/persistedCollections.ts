import type { QueryClient } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';

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
  if (queryKeyMatchesFragments(queryKey, PERSISTED_SET_KEY_FRAGMENTS)) {
    return normalizePersistedSet(data);
  }
  if (queryKeyMatchesFragments(queryKey, PERSISTED_MAP_KEY_FRAGMENTS)) {
    return normalizePersistedMap(data);
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
