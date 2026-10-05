import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ query: vi.fn(), doc: vi.fn(), profile: vi.fn(), listen: vi.fn() }));
vi.mock('@/lib/firebase/firestoreDb', () => ({
  getDocumentsFromServer: state.query, getDocumentFromServer: state.doc, getDocument: state.profile,
  getDocuments: vi.fn(), collectionRef: (name: string) => name, documentRef: vi.fn(), setDocument: vi.fn(), newDocumentId: vi.fn(),
  onSnapshot: state.listen, query: (...args: unknown[]) => args, where: (...args: unknown[]) => args, orderBy: vi.fn(), firestoreLimit: (value: number) => ({ limit: value }),
}));
import { fetchLiveFriends, subscribeLiveFriends } from './firestore';
const share = (extra = {}) => ({ id: 'alice_bob', viewer_id: 'alice', sharer_id: 'bob', active: true, paused: false, precision: 'approximate', expires_at: new Date(Date.now() + 60_000).toISOString(), ...extra });
const live = (extra = {}) => ({ user_id: 'bob', latitude: 30, longitude: -97, sharing_enabled: true, is_ghost: false, expires_at: new Date(Date.now() + 60_000).toISOString(), updated_at: new Date().toISOString(), ...extra });
beforeEach(() => { vi.clearAllMocks(); state.query.mockResolvedValue([share()]); state.doc.mockResolvedValue(live()); state.profile.mockResolvedValue({ username: 'Bob' }); });
describe('map uses explicit current location shares', () => {
  it('queries only viewer grants, then exact live documents; approximate grants stay approximate', async () => {
    const result = await fetchLiveFriends('alice', ['bob'], () => {});
    expect(state.query).toHaveBeenCalledExactlyOnceWith('location_shares', [['viewer_id', '==', 'alice'], { limit: 201 }]);
    expect(state.doc).toHaveBeenCalledExactlyOnceWith('user_live_locations', 'bob');
    expect(result[0].latitude).not.toBe(30); expect(result[0].sharing_mode).toBe('approximate');
  });
  it.each([{ active: false }, { paused: true }, { viewer_id: 'other' }, { sharer_id: 'other' }, { expires_at: 'bad' }, { expires_at: '2000-01-01' }])('does not read a revoked, expired or foreign grant %j', async invalid => {
    state.query.mockResolvedValue([share(invalid)]);
    expect(await fetchLiveFriends('alice', ['bob'], () => {})).toEqual([]); expect(state.doc).not.toHaveBeenCalled();
  });
  it('propagates a current admission failure instead of claiming an empty map', async () => {
    state.doc.mockRejectedValue(new Error('permission denied'));
    await expect(fetchLiveFriends('alice', ['bob'], () => {})).rejects.toThrow('permission denied');
  });
  it('does not read coordinates after account changes while loading grants', async () => {
    let current = true; state.query.mockImplementation(async () => { current = false; return [share()]; });
    await expect(fetchLiveFriends('alice', ['bob'], () => { if (!current) throw new Error('account changed'); })).rejects.toThrow('account changed');
    expect(state.doc).not.toHaveBeenCalled();
  });
  it('does not accept a malformed or mismatched live row', async () => {
    state.doc.mockResolvedValue(live({ expires_at: 'bad' })); expect(await fetchLiveFriends('alice', ['bob'], () => {})).toEqual([]);
    state.doc.mockResolvedValue(live({ user_id: 'other' })); expect(await fetchLiveFriends('alice', ['bob'], () => {})).toEqual([]);
  });
  it('subscribes to only viewer grants and surfaces listener failures', () => {
    const update = vi.fn(), error = vi.fn(); subscribeLiveFriends('alice', update, error);
    expect(state.listen).toHaveBeenCalledWith(['location_shares', ['viewer_id', '==', 'alice'], { limit: 201 }], expect.any(Function), error);
  });
});
