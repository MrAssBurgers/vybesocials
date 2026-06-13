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
