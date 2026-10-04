import { describe, expect, it, vi } from 'vitest';
import { dehydrate, QueryClient } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';

const state = vi.hoisted(() => ({ options: null as null | {
  serialize: (value: PersistedClient) => string;
  deserialize: (value: string) => PersistedClient;
} }));
vi.mock('@tanstack/query-async-storage-persister', () => ({
  createAsyncStoragePersister: (options: typeof state.options) => { state.options = options; return {}; },
}));
vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }));
import { shouldPersistQueryKey } from './queryPersister';

const privateKeys = ['admin-reports', 'report-inspection', 'pending-moderation-count', 'post-deletion-log', 'feed-mutes'];
function cachedClient(): PersistedClient {
  const client = new QueryClient();
  for (const key of privateKeys) client.setQueryData([key, 'staff-uid', 1], { note: 'private review', source: 'private inspected source' });
  client.setQueryData(['public-fixture'], { title: 'Public content' });
  const result = { timestamp: Date.now(), buster: 'fixture', clientState: dehydrate(client) };
  client.clear();
  return result;
}

describe('moderation data stays out of disk query persistence', () => {
  it.each(privateKeys)('does not dehydrate %s', key => {
    expect(shouldPersistQueryKey([key, 'staff-uid', 1], { private: true })).toBe(false);
  });

  it('also strips private queries at serialization while retaining unrelated content', () => {
    const serialized = state.options!.serialize(cachedClient());
    expect(serialized).not.toContain('private review');
    expect(serialized).not.toContain('private inspected source');
    expect(JSON.parse(serialized).clientState.queries.map((entry: { queryKey: string[] }) => entry.queryKey[0])).toEqual(['public-fixture']);
  });

  it('does not restore old private snapshots saved before the migration', () => {
    const restored = state.options!.deserialize(JSON.stringify(cachedClient()));
    expect(restored.clientState.queries.map(entry => entry.queryKey[0])).toEqual(['public-fixture']);
    expect(restored.clientState.queries[0].state.data).toEqual({ title: 'Public content' });
  });
});
