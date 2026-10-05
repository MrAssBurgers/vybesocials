import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ call: vi.fn(), epoch: 1, uid: 'alice' }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.call }));
vi.mock('@/lib/tokenMarketplaceService', () => ({ tokenAccountSnapshot: () => ({ uid: state.uid, epoch: state.epoch }) }));
import { changeComment, saveCommentChange } from './commentChanges';
beforeEach(() => { vi.clearAllMocks(); state.epoch++; state.uid = 'alice'; state.call.mockImplementation(async (_name, input) => ({ error: null, data: {
  ok: true, ownerUid: input.expectedOwnerUid, profileId: input.expectedProfileId, action: input.action, postId: input.postId, commentId: input.commentId ?? 'created-comment',
  requestId: input.requestId, revision: 'b'.repeat(48), ...(input.action === 'like' ? { liked: input.liked } : {}) } })); });
describe('checked comment changes', () => {
  it.each(['edit', 'delete'] as const)('sends the exact bound %s operation and revision', async action => {
    const guard = vi.fn(); const result = await changeComment({ action, commentId: 'comment', postId: 'post', text: 'Updated', expectedRevision: 'a'.repeat(48) }, 'alice-profile', guard);
    expect(result.guard).toBe(guard); expect(state.call).toHaveBeenCalledWith('managePostComment', expect.objectContaining({ expectedOwnerUid: 'alice', expectedProfileId: 'alice-profile', action, commentId: 'comment', postId: 'post', expectedRevision: 'a'.repeat(48) }));
  });
  it.each([{ ownerUid: 'bob' }, { profileId: 'bob-profile' }, { action: 'create' }, { postId: 'other-post' }, { commentId: 'other-comment' }, { requestId: 'wrong' }, { revision: null }])('rejects a mismatched receipt %j', async patch => {
    state.call.mockImplementation(async (_name, input) => ({ data: { ok: true, ownerUid: 'alice', profileId: 'alice-profile', action: 'delete', postId: 'post', commentId: 'comment', requestId: input.requestId, revision: 'b'.repeat(48), ...patch } }));
    await expect(changeComment({ action: 'delete', commentId: 'comment', postId: 'post', expectedRevision: 'a'.repeat(48) }, 'alice-profile', () => {})).rejects.toThrow('could not be verified');
  });
  it('keeps the same request ID after an ambiguous failure and uses a new one after acknowledgement', async () => {
    const body = { action: 'create' as const, postId: 'post', text: 'Retry draft', imageUrl: null };
    state.call.mockResolvedValueOnce({ error: { message: 'Unavailable', name: 'unavailable' } });
    await expect(saveCommentChange(body, 'alice-profile', () => {})).rejects.toThrow('Unavailable');
    await saveCommentChange(body, 'alice-profile', () => {}); await saveCommentChange(body, 'alice-profile', () => {});
    expect(state.call.mock.calls[0][1].requestId).toBe(state.call.mock.calls[1][1].requestId); expect(state.call.mock.calls[2][1].requestId).not.toBe(state.call.mock.calls[1][1].requestId);
  });
  it('does not turn a verified committed receipt into a failed save after the account changed', async () => {
    let active = true; const base = state.call.getMockImplementation()!;
    state.call.mockImplementation(async (...args) => { const result = await base(...args); active = false; return result; });
    const guard = () => { if (!active) throw new Error('Account changed'); };
    const saved = await changeComment({ action: 'delete', commentId: 'comment', postId: 'post', expectedRevision: null }, 'alice-profile', guard);
    expect(() => saved.guard()).toThrow('Account changed');
  });
});
