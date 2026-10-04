import { describe, expect, it, vi } from 'vitest';
import { dehydrate, QueryClient } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
const state = vi.hoisted(() => ({ options: null as null | { serialize: (value: PersistedClient) => string; deserialize: (value: string) => PersistedClient } }));
vi.mock('@tanstack/query-async-storage-persister', () => ({ createAsyncStoragePersister: (options: typeof state.options) => { state.options = options; return {}; } }));
vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }));
import { shouldPersistQueryKey } from './queryPersister';
describe('notes stay out of shared disk storage', () => {
  it.each(['my-note', 'friends-notes'])('excludes %s from dehydration', root => expect(shouldPersistQueryKey([root, 'alice'], [{ content: 'Private note' }])).toBe(false));
  it('removes old note snapshots on restore and new ones on serialization', () => {
    const client = new QueryClient();
    client.setQueryData(['my-note', 'alice'], { content: 'Private own note' });
    client.setQueryData(['friends-notes', 'alice'], [{ content: 'Private friend note' }]);
    client.setQueryData(['public-fixture'], { title: 'Public' });
    const saved = { timestamp: Date.now(), buster: 'fixture', clientState: dehydrate(client) }; client.clear();
    expect(state.options!.serialize(saved)).not.toContain('Private');
    expect(state.options!.deserialize(JSON.stringify(saved)).clientState.queries.map(query => query.queryKey[0])).toEqual(['public-fixture']);
  });
});
