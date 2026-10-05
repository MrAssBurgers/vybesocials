import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ manage: vi.fn(), uid: 'player', epoch: 1 }));
vi.mock('./postMutationService', () => ({ managePost: state.manage }));
vi.mock('./reportModerationService', () => ({ reportAccountSnapshot: () => ({ uid: state.uid, epoch: state.epoch }), reportAccountGuard: (uid: string) => { const epoch = state.epoch; return () => { if (state.uid !== uid || epoch !== state.epoch) throw new Error('Account changed'); }; } }));
import { findGameCapturePost, saveGameCapturePost } from './gameCapturePost';
const captureId = 'a'.repeat(48), postId = 'game_' + captureId;
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); state.uid = 'player'; state.epoch = 1; });
describe('protected game capture publication adapter', () => {
  it('uses a checked missing-read instead of a raw denied document lookup', async () => {
    state.manage.mockResolvedValue({ status: 'missing', post: null });
    expect(await findGameCapturePost(captureId, 'profile')).toBeNull();
    expect(state.manage).toHaveBeenCalledWith({ uid: 'player', profileId: 'profile' }, { action: 'read', postId }, expect.any(Function));
  });
  it('recovers only a current protected publication matching this capture', async () => {
    state.manage.mockResolvedValue({ status: 'published', post: { id: postId, authorId: 'profile', caption: 'Original', gameCaptureId: captureId } });
    expect(await findGameCapturePost(captureId, 'profile')).toMatchObject({ id: postId, caption: 'Original' });
  });
  it.each(['legacy', 'deleted'])('never silently re-adopts or resurrects %s captures', async status => {
    state.manage.mockResolvedValue({ status, post: { gameCaptureId: captureId } });
    await expect(findGameCapturePost(captureId, 'profile')).rejects.toThrow();
  });
  it('does not accept a different capture relation', async () => {
    state.manage.mockResolvedValue({ status: 'published', post: { gameCaptureId: 'b'.repeat(48) } });
    await expect(findGameCapturePost(captureId, 'profile')).rejects.toThrow('owner review');
  });
  it('passes deterministic post and capture identity to the server without browser transaction writes', async () => {
    state.manage.mockImplementation(async (actor, request) => ({ status: 'published', created: false, post: { ...request.payload, id: request.postId, authorId: actor.profileId } }));
    const result = await saveGameCapturePost(captureId, 'profile', { caption: 'First', author_id: 'forged', view_count: 100 });
    expect(result.created).toBe(false);
    expect(state.manage.mock.calls[0][1]).toMatchObject({ action: 'create', postId, payload: { gameCaptureId: captureId, caption: 'First' } });
    expect(state.manage.mock.calls[0][1].payload).not.toHaveProperty('author_id');
  });
  it('rejects stale read completions and arbitrary IDs', async () => {
    state.manage.mockImplementation(async () => { state.epoch += 2; return { status: 'missing' }; });
    await expect(findGameCapturePost(captureId, 'profile')).rejects.toThrow('Account changed');
    state.manage.mockClear(); await expect(findGameCapturePost('../arbitrary', 'profile')).rejects.toThrow('Invalid'); expect(state.manage).not.toHaveBeenCalled();
  });
});
