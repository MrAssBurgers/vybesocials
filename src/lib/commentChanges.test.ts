import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ row: { user_id: 'alice-profile', post_id: 'post' } as Record<string, unknown> | null, get: vi.fn(), update: vi.fn(), delete: vi.fn(), guard: vi.fn() }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ getFirestoreDb: () => ({}) }));
vi.mock('firebase/firestore', () => ({ doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`, runTransaction: async (_db: unknown, run: (tx: unknown) => Promise<void>) => run({ get: state.get, update: state.update, delete: state.delete }) }));
import { changeComment } from './commentChanges';
beforeEach(() => { vi.clearAllMocks(); state.row = { user_id: 'alice-profile', post_id: 'post' }; state.guard.mockReset(); state.get.mockImplementation(async () => ({ exists: () => !!state.row, data: () => state.row })); });
describe('atomic comment changes', () => {
  it.each(['edit', 'delete'] as const)('changes only the verified comment: %s', async action => {
    await changeComment({ action, commentId: 'comment', postId: 'post', text: 'Updated' }, 'alice-profile', state.guard);
    if (action === 'edit') expect(state.update).toHaveBeenCalledWith('comments/comment', { text: 'Updated' });
    else expect(state.delete).toHaveBeenCalledWith('comments/comment');
  });
  it.each(['missing', 'owner', 'post'])('does not mutate an unavailable or mismatched row: %s', async reason => {
    state.row = reason === 'missing' ? null : { user_id: reason === 'owner' ? 'bob-profile' : 'alice-profile', post_id: reason === 'post' ? 'other-post' : 'post' };
    await expect(changeComment({ action: 'edit', commentId: 'comment', postId: 'post', text: 'Updated' }, 'alice-profile', state.guard)).rejects.toThrow();
    expect(state.update).not.toHaveBeenCalled(); expect(state.delete).not.toHaveBeenCalled();
  });
  it('rechecks the session after reading before scheduling a delete', async () => {
    state.guard.mockImplementationOnce(() => {}).mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('Account changed'); });
    await expect(changeComment({ action: 'delete', commentId: 'comment', postId: 'post' }, 'alice-profile', state.guard)).rejects.toThrow('Account changed');
    expect(state.delete).not.toHaveBeenCalled();
  });
});
