import { describe, expect, it, vi } from 'vitest';
import { dehydrate, QueryClient } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
const state = vi.hoisted(() => ({ options: null as null | { serialize: (value: PersistedClient) => string; deserialize: (value: string) => PersistedClient } }));
vi.mock('@tanstack/query-async-storage-persister', () => ({ createAsyncStoragePersister: (options: typeof state.options) => { state.options = options; return {}; } }));
vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => ({ uid: 'alice', epoch: 1 }) }));
import { shouldPersistQueryKey } from './queryPersister';
import { installQueryCacheNormalizer, installQueryCacheWriteGuard, reviveQueriesInCache } from './persistedCollections';
import { purgeStuckStoryUploads } from './storiesCacheSanitize';
const roots = ['stories', 'visible-story', 'story-author', 'friend-profile-stories', 'story-highlights', 'close-friends', 'close-friend-ids', 'story-likes', 'story-views', 'story-polls', 'story-poll-votes'];
describe('private story cache storage', () => {
  it.each(roots)('never persists %s', root => { expect(shouldPersistQueryKey([root, 'alice', 1], ['secret'])).toBe(false); });
  it('removes legacy and modern multi-account snapshots both on write and before revival', () => {
    const client = new QueryClient();
    roots.forEach(root => { client.setQueryData([root, 'alice'], { malformed: 'secret' }); client.setQueryData([root, 'bob', 2], ['secret']); });
    client.setQueryData(['public-profile', 'bob'], { username: 'Bob' });
    const snapshot = { timestamp: Date.now(), buster: 'fixture', clientState: dehydrate(client) };
    expect(state.options!.serialize(snapshot)).not.toContain('secret');
    const restored = state.options!.deserialize(JSON.stringify(snapshot));
    expect(restored.clientState.queries.map(row => row.queryKey)).toEqual([['public-profile', 'bob']]); client.clear();
  });
  it.each(['stories', 'story-author', 'close-friends'])('preserves live %s pages through both application normalizers and updater writes', root => {
    const client = new QueryClient(); installQueryCacheWriteGuard(client); const stop = installQueryCacheNormalizer(client);
    const key = [root, 'profile-alice', 'alice', 1];
    const pages = { pages: [{ stories: [{ id: 's1', media_url: 'private' }], nextCursor: 'next', friends: [], candidates: [] }], pageParams: [null] };
    client.setQueryData(key, pages); reviveQueriesInCache(client);
    expect(client.getQueryData(key)).toEqual(pages);
    client.setQueryData<typeof pages>(key, old => ({ ...old!, pages: [...old!.pages, { ...old!.pages[0], nextCursor: null }] }));
    expect(client.getQueryData<typeof pages>(key)?.pages).toHaveLength(2); stop(); client.clear();
  });
  it('only purges stale current-account optimistic rows and preserves pagination and active uploads', () => {
    const client = new QueryClient(); const key = ['stories', 'profile-alice', 'alice', 1];
    const data = { pages: [{ stories: [
      { id: 'stale', isUploading: true, created_at: new Date(Date.now() - 360000).toISOString() },
      { id: 'active', isUploading: true, created_at: new Date().toISOString() }, { id: 'saved' }], nextCursor: 'next' }], pageParams: [null] };
    client.setQueryData(key, data); client.setQueryData(['stories', 'profile-alice', 'alice', 0], data); client.setQueryData(['stories', 'profile-bob', 'bob', 1], data);
    purgeStuckStoryUploads(client, 'profile-alice', { uid: 'alice', epoch: 1 });
    expect(client.getQueryData<typeof data>(key)?.pages[0].stories.map(row => row.id)).toEqual(['active', 'saved']);
    expect(client.getQueryData<typeof data>(key)?.pages[0].nextCursor).toBe('next');
    expect(client.getQueryData(['stories', 'profile-alice', 'alice', 0])).toEqual(data); expect(client.getQueryData(['stories', 'profile-bob', 'bob', 1])).toEqual(data); client.clear();
  });
});
