import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ read: vi.fn(), from: vi.fn(), snapshot: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { from: state.from } }));
vi.mock('@/lib/firebase/firestoreDb', () => ({
  getDocumentsFromServer: state.read, collectionRef: (table: string) => table,
  where: (...values: unknown[]) => values, orderBy: (...values: unknown[]) => values,
  firestoreLimit: (value: number) => ['limit', value], query: (...values: unknown[]) => values, onSnapshot: state.snapshot,
}));
import { loadCommunityMessages, watchCommunityChannel } from './communityMessages';
beforeEach(() => { vi.clearAllMocks(); state.read.mockResolvedValue([]); });
describe('community history uses current server authority', () => {
  it('reads bounded nondeleted channel rows from the server, never offline history', async () => {
    await expect(loadCommunityMessages('private', vi.fn())).resolves.toEqual([]);
    expect(state.read).toHaveBeenCalledWith('channel_messages', [['channel_id', '==', 'private'], ['is_deleted', '==', false], ['created_at', 'asc'], ['limit', 100]]);
    expect(state.from).not.toHaveBeenCalled();
  });
  it('does not fall back to local history when the server denies access', async () => {
    const error = Object.assign(new Error('Removed'), { code: 'permission-denied' }); state.read.mockRejectedValue(error);
    await expect(loadCommunityMessages('private', vi.fn())).rejects.toBe(error); expect(state.from).not.toHaveBeenCalled();
  });
  it('checks the original account after message retrieval before resolving authors', async () => {
    let active = true; state.read.mockImplementation(async () => { active = false; return [{ id: 'private-message', sender_id: 'private-author' }]; });
    const guard = () => { if (!active) throw new Error('Account changed'); };
    await expect(loadCommunityMessages('private', guard)).rejects.toThrow('Account changed'); expect(state.from).not.toHaveBeenCalled();
  });
  it('checks the original account again after the profile lookup', async () => {
    state.read.mockResolvedValue([{ id: 'private-message', sender_id: 'author', channel_id: 'private' }]);
    let active = true; state.from.mockReturnValue({ select: () => ({ in: async () => { active = false; return { data: [{ id: 'author' }], error: null }; } }) });
    await expect(loadCommunityMessages('private', () => { if (!active) throw new Error('Account changed'); })).rejects.toThrow('Account changed');
  });
  it('does not accept cache-only snapshots and forwards actual listener failures', () => {
    const changed = vi.fn(), failed = vi.fn(), stop = vi.fn(); state.snapshot.mockReturnValue(stop);
    expect(watchCommunityChannel('private', changed, failed)).toBe(stop);
    const [, next, error] = state.snapshot.mock.calls[0];
    next({ metadata: { fromCache: true } }); expect(changed).not.toHaveBeenCalled();
    next({ metadata: { fromCache: false } }); expect(changed).toHaveBeenCalledTimes(1);
    const denied = new Error('Removed'); error(denied); expect(failed).toHaveBeenCalledWith(denied);
  });
});
