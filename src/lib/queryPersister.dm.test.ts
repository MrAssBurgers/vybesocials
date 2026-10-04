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

const privateKeys = [
  'dm-conversations', 'conversations', 'conversation-detail', 'conversation',
  'messages', 'chat-search', 'message-transcript', 'message-pins', 'message-requests',
  'conversation-offers', 'scheduled-messages', 'vanish-messages', 'vanish-threads',
  'trashed-conversations', 'dm-reminders', 'word-reactions',
  'custom-sounds', // Signed custom-tone URLs are also private per-account data.
];
function snapshot(): PersistedClient {
  const client = new QueryClient();
  for (const account of ['alice', 'bob']) {
    for (const root of privateKeys) {
      client.setQueryData([root, account, 'conversation-a'], [{
        id: 'conversation-a', content: `${account} private message`,
        last_message: { content: `${account} private preview` }, members: [],
      }]);
    }
  }
  client.setQueryData(['public-feed-fixture'], { title: 'Public post' });
  client.setQueryData(['public-profile-fixture'], { username: 'creator' });
  const result = { timestamp: Date.now(), buster: 'fixture', clientState: dehydrate(client) };
  client.clear();
  return result;
}

describe('private messages never enter or return from shared disk query storage', () => {
  it.each(privateKeys)('denies %s even with a nonempty, account-scoped result', root => {
    expect(shouldPersistQueryKey([root, 'alice', 3], [{ content: 'private' }])).toBe(false);
  });

  it('strips all accounts at serialization even if upstream dehydration included them', () => {
    const client = snapshot();
    const serialized = state.options!.serialize(client);
    expect(serialized).not.toContain('private message');
    expect(serialized).not.toContain('private preview');
    expect(JSON.parse(serialized).clientState.queries.map((entry: { queryKey: string[] }) => entry.queryKey[0]))
      .toEqual(['public-feed-fixture', 'public-profile-fixture']);
    // Filtering disk output must not remove the current account's live cache.
    expect(client.clientState.queries).toHaveLength(privateKeys.length * 2 + 2);
  });

  it('migrates old multi-account disk snapshots without restoring any private rows', () => {
    const restored = state.options!.deserialize(JSON.stringify(snapshot()));
    expect(restored.clientState.queries.map(entry => entry.queryKey[0]))
      .toEqual(['public-feed-fixture', 'public-profile-fixture']);
    expect(restored.clientState.queries.map(entry => entry.state.data))
      .toEqual([{ title: 'Public post' }, { username: 'creator' }]);
  });

  it('drops legacy malformed private records before revival while keeping public data', () => {
    const client = snapshot();
    const privateEntry = client.clientState.queries[0];
    privateEntry.state.data = { 0: { members: { old: { profile: { id: 'foreign-user' } } }, last_message: { content: 'private preview' } } };
    const restored = state.options!.deserialize(JSON.stringify(client));
    expect(JSON.stringify(restored)).not.toContain('foreign-user');
    expect(restored.clientState.queries).toHaveLength(2);
  });
});
