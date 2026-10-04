import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
const mocks = vi.hoisted(() => ({ read: vi.fn(), remove: vi.fn(), rows: vi.fn(), write: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/auth', () => ({ waitForAuthSession: async () => ({ user: { id: 'alice' } }) }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ getDocumentFromServer: mocks.read, deleteDocument: mocks.remove,
  getDocuments: mocks.rows, setDocument: mocks.write, awaitPendingFirestoreWrites: async () => {}, where: vi.fn(), firestoreLimit: vi.fn() }));
import { patchReactionInFeedCaches, removePostReaction } from './postReactions';
beforeEach(() => { vi.clearAllMocks(); mocks.rows.mockResolvedValue([]); mocks.read.mockResolvedValue(null); mocks.remove.mockResolvedValue(undefined); });
describe('reaction cleanup under owner-only delete rules', () => {
  it('keeps the displayed count stable across cache updates, emoji changes and rollback', () => {
    const client = new QueryClient(); const key = ['social-feed', 'alice'];
    client.setQueryData(key, { pages: [{ posts: [{ id: 'post', like_count: 4, is_liked: false }] }], pageParams: [undefined] });
    const row = () => client.getQueryData<{ pages: { posts: { like_count: number }[] }[] }>(key)!.pages[0].posts[0];
    patchReactionInFeedCaches(client, 'post', 'love'); expect(row().like_count).toBe(5);
    patchReactionInFeedCaches(client, 'post', 'haha'); expect(row().like_count).toBe(5);
    patchReactionInFeedCaches(client, 'post', null); expect(row().like_count).toBe(4);
    patchReactionInFeedCaches(client, 'post', null); expect(row().like_count).toBe(4); client.clear();
  });
  it('does not delete absent deterministic alias rows', async () => {
    mocks.read.mockImplementation(async (_table, id) => id === 'profile-alice_post' ? { id, user_id: 'profile-alice' } : null);
    await removePostReaction('profile-alice', 'post', 'alice');
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith('likes', 'profile-alice_post');
  });
  it('accepts concurrent removal only after server-confirmed absence', async () => {
    let reads = 0;
    mocks.read.mockImplementation(async () => ++reads <= 2 ? { id: 'profile-alice_post' } : null);
    mocks.remove.mockRejectedValue(new Error('PERMISSION_DENIED'));
    await expect(removePostReaction('profile-alice', 'post')).resolves.toBeUndefined();
    expect(reads).toBe(3);
  });
  it('does not swallow denied deletion of an existing row', async () => {
    mocks.read.mockResolvedValue({ id: 'profile-alice_post' }); mocks.remove.mockRejectedValue(new Error('PERMISSION_DENIED'));
    await expect(removePostReaction('profile-alice', 'post')).rejects.toThrow('PERMISSION_DENIED');
  });
  it('never treats an unavailable read as an absent reaction', async () => {
    mocks.read.mockRejectedValue(new Error('Offline'));
    await expect(removePostReaction('profile-alice', 'post')).rejects.toThrow('Offline'); expect(mocks.remove).not.toHaveBeenCalled();
  });
});
