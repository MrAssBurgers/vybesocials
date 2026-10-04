import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ update: vi.fn(), insert: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { rpc: state.rpc, from: (table: string) => ({
  update: (payload: unknown) => ({ eq: (field: string, id: string) => state.update(table, payload, field, id) }),
  insert: (payload: unknown) => ({ select: () => ({ single: () => state.insert(table, payload) }) }),
}) } }));
import { publishMusicPost, recordMusicUsage, saveMusicPersonality } from './musicWriteResults';
beforeEach(() => vi.clearAllMocks());
describe('music durable acknowledgements', () => {
  it('requires an actual matching profile update and never requests caller-supplied XP', async () => {
    state.update.mockResolvedValue({ data: [{ id: 'profile-a' }], error: null });
    await saveMusicPersonality('profile-a', 'pop');
    expect(state.update).toHaveBeenCalledWith('profiles', { music_personality: 'pop' }, 'id', 'profile-a'); expect(state.rpc).not.toHaveBeenCalled();
  });
  it.each([{ data: null, error: { message: 'Denied' } }, { data: [], error: null }, { data: [{ id: 'other' }], error: null }])('refuses failed or unmatched profile save %j', async result => {
    state.update.mockResolvedValue(result); await expect(saveMusicPersonality('profile-a', 'pop')).rejects.toThrow();
  });
  it.each([{ data: null, error: { message: 'Denied' } }, { data: null, error: null }, { data: { id: 'post-a', author_id: 'other' }, error: null }])('refuses unconfirmed publication %j', async result => {
    state.insert.mockResolvedValue(result); await expect(publishMusicPost({ author_id: 'profile-a', type: 'post', caption: 'Music' })).rejects.toThrow();
  });
  it('returns the actual post receipt without granting XP', async () => {
    state.insert.mockResolvedValue({ data: { id: 'post-a', author_id: 'profile-a' }, error: null });
    await expect(publishMusicPost({ author_id: 'profile-a', type: 'post', caption: 'Music' })).resolves.toBe('post-a'); expect(state.rpc).not.toHaveBeenCalled();
  });
  it('separates missing usage counters from the successful primary operation', async () => {
    state.rpc.mockResolvedValueOnce({ data: null, error: { name: 'not-found' } }).mockRejectedValueOnce(new Error('Offline'));
    await expect(recordMusicUsage('track-a', 'shares')).resolves.toBe(false);
    await expect(recordMusicUsage('track-a', 'plays')).resolves.toBe(false);
    expect(state.rpc.mock.calls).toEqual([['update_track_usage', { p_track_id: 'track-a', p_shares: 1 }], ['update_track_usage', { p_track_id: 'track-a', p_plays: 1 }]]);
  });
});
