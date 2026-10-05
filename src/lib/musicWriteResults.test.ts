import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ update: vi.fn(), insert: vi.fn(), rpc: vi.fn(), manage: vi.fn(), epoch: 1 }));
vi.mock('@/lib/firebase', () => ({ db: { rpc: state.rpc, from: (table: string) => ({
  update: (payload: unknown) => ({ eq: (field: string, id: string) => state.update(table, payload, field, id) }),
  insert: (payload: unknown) => ({ select: () => ({ single: () => state.insert(table, payload) }) }),
}) } }));
vi.mock('./postMutationService', () => ({ managePost: state.manage }));
vi.mock('./reportModerationService', () => ({ reportAccountSnapshot: () => ({ uid: 'alice', epoch: state.epoch }), reportAccountGuard: () => { const epoch = state.epoch; return () => { if (epoch !== state.epoch) throw new Error('Account changed'); }; } }));
import { listPreparedPosts, forgetPreparedPost } from './postCreateAttempts';
import { publishMusicPost, recordMusicUsage, saveMusicPersonality } from './musicWriteResults';
beforeEach(() => { vi.clearAllMocks(); state.epoch = 1; for (const row of listPreparedPosts('alice')) forgetPreparedPost('alice', row.postId); sessionStorage.clear(); });
describe('music durable acknowledgements', () => {
  it('requires an actual matching profile update and never requests caller-supplied XP', async () => {
    state.update.mockResolvedValue({ data: [{ id: 'profile-a' }], error: null });
    await saveMusicPersonality('profile-a', 'pop');
    expect(state.update).toHaveBeenCalledWith('profiles', { music_personality: 'pop' }, 'id', 'profile-a'); expect(state.rpc).not.toHaveBeenCalled();
  });
  it.each([{ data: null, error: { message: 'Denied' } }, { data: [], error: null }, { data: [{ id: 'other' }], error: null }])('refuses failed or unmatched profile save %j', async result => {
    state.update.mockResolvedValue(result); await expect(saveMusicPersonality('profile-a', 'pop')).rejects.toThrow();
  });
  it('retains a failed music request and retries the same body without raw inserts or XP', async () => {
    state.manage.mockRejectedValueOnce(new Error('Response lost')).mockImplementationOnce(async (actor, request) => ({ status: 'published', postId: request.postId, post: { ...request.payload, id: request.postId, authorId: actor.profileId } }));
    const post = { author_id: 'profile-a', type: 'post' as const, caption: 'Music' };
    await expect(publishMusicPost(post)).rejects.toThrow('Response lost');
    const id = await publishMusicPost(post);
    expect(state.manage.mock.calls[1][1]).toEqual(state.manage.mock.calls[0][1]);
    expect(id).toBe(state.manage.mock.calls[0][1].postId); expect(state.insert).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
  });
  it('keeps the pending request when the account changes after server acknowledgement', async () => {
    state.manage.mockImplementationOnce(async (_actor, request) => { state.epoch += 2; return { status: 'published', postId: request.postId, post: {} }; });
    await expect(publishMusicPost({ author_id: 'profile-a', type: 'post', caption: 'Music' })).rejects.toThrow('Account changed');
    expect(listPreparedPosts('alice')).toHaveLength(1);
  });
  it('separates missing usage counters from the successful primary operation', async () => {
    state.rpc.mockResolvedValueOnce({ data: null, error: { name: 'not-found' } }).mockRejectedValueOnce(new Error('Offline'));
    await expect(recordMusicUsage('track-a', 'shares')).resolves.toBe(false);
    await expect(recordMusicUsage('track-a', 'plays')).resolves.toBe(false);
    expect(state.rpc.mock.calls).toEqual([['update_track_usage', { p_track_id: 'track-a', p_shares: 1 }], ['update_track_usage', { p_track_id: 'track-a', p_plays: 1 }]]);
  });
});
