import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ manage: vi.fn(), uid: 'alice', epoch: 1 }));
vi.mock('./postMutationService', () => ({ managePost: state.manage }));
vi.mock('./reportModerationService', () => ({ reportAccountGuard: (uid: string) => { const epoch = state.epoch; return () => { if (!uid || uid !== state.uid || epoch !== state.epoch) throw new Error('Account changed'); }; } }));
const payload = { type: 'post' as const, caption: 'Original', tags: ['tag'], mediaUrl: 'https://example.com/media.jpg', mediaUrls: [], thumbnailUrl: null, ageRating: 'safe' as const, visibility: 'public' as const };
const actor = { uid: 'alice', profileId: 'profile-a' };
async function module() { return import('./postCreateAttempts'); }
beforeEach(() => { vi.resetModules(); sessionStorage.clear(); state.manage.mockReset(); state.uid = 'alice'; state.epoch = 1; });
function ack(postId: string, body = payload) { return { status: 'published', postId, created: true, post: { ...body, id: postId, authorId: actor.profileId }, revision: 'a'.repeat(48) }; }
describe('exact publication request recovery', () => {
  it('retains exact payload and request across a lost response and module reload, clearing only on acknowledgement', async () => {
    const first = await module(), postId = crypto.randomUUID();
    const attempt = first.preparePostCreate(actor, postId, payload);
    payload.tags.push('later');
    expect(attempt.payload.tags).toEqual(['tag']); payload.tags.pop();
    state.manage.mockRejectedValueOnce(new Error('Lost response'));
    await expect(first.submitPreparedPost(attempt)).rejects.toThrow('Lost response');
    vi.resetModules(); const reloaded = await module(), saved = reloaded.getPreparedPost(actor.uid, postId)!;
    expect(saved).toEqual(attempt);
    state.manage.mockResolvedValue(ack(postId)); await reloaded.submitPreparedPost(saved);
    expect(state.manage.mock.calls[0][1]).toEqual(state.manage.mock.calls[1][1]);
    expect(reloaded.listPreparedPosts(actor.uid)).toEqual([]);
  });
  it('refuses content changes for a retained ID and never exposes another owner through recovery', async () => {
    const mod = await module(), id = crypto.randomUUID(); mod.preparePostCreate(actor, id, payload);
    expect(() => mod.preparePostCreate(actor, id, { ...payload, caption: 'Changed' })).toThrow('different content');
    expect(mod.getPreparedPost('bob', id)).toBeUndefined(); expect(mod.listPreparedPosts('bob')).toEqual([]);
  });
  it('retains a committed but unacknowledged result after account ABA and refuses retired callbacks', async () => {
    const mod = await module(), id = crypto.randomUUID(), attempt = mod.preparePostCreate(actor, id, payload);
    state.manage.mockImplementation(async () => { state.epoch += 2; return ack(id); });
    await expect(mod.submitPreparedPost(attempt)).rejects.toThrow('Account changed');
    expect(mod.getPreparedPost(actor.uid, id)?.requestId).toBe(attempt.requestId);
  });
  it('does not dispatch when durable receipt storage fails', async () => {
    const mod = await module(); const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full'); });
    expect(() => mod.preparePostCreate(actor, crypto.randomUUID(), payload)).toThrow('not been submitted');
    expect(state.manage).not.toHaveBeenCalled(); spy.mockRestore();
  });
  it('does not restore a tombstoned publication', async () => {
    const mod = await module(), id = crypto.randomUUID(), attempt = mod.preparePostCreate(actor, id, payload);
    state.manage.mockResolvedValue({ status: 'deleted', post: null });
    await expect(mod.submitPreparedPost(attempt)).rejects.toThrow('already removed');
    expect(mod.getPreparedPost(actor.uid, id)).toBeUndefined();
  });
  it('does not send caller authorship, moderation status or counters in compatibility payloads', async () => {
    const mod = await module(); expect(mod.postPayloadFromLegacy({ author_id: 'victim', caption: 'Hi', view_count: 900, moderation_status: 'approved', type: 'post' })).toEqual({ type: 'post', caption: 'Hi', tags: [], mediaUrl: null, mediaUrls: [], thumbnailUrl: null, ageRating: 'unrated', visibility: 'public' });
  });
  it('never widens a legacy private or unknown audience to public', async () => {
    const mod = await module(); expect(mod.postPayloadFromLegacy({ visibility: 'private' }).visibility).toBe('only_me');
    expect(mod.postPayloadFromLegacy({ visibility: 'followers' }).visibility).toBe('followers');
    expect(() => mod.postPayloadFromLegacy({ visibility: 'mystery' })).toThrow('supported audience');
  });

});
