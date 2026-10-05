import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ invoke: vi.fn(), epoch: 1, uid: 'alice' }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('@/lib/tokenMarketplaceService', () => ({ tokenAccountSnapshot: () => ({ uid: state.uid, epoch: state.epoch }), tokenAccountGuard: () => {
  const epoch = state.epoch; return () => { if (epoch !== state.epoch) throw new Error('Account changed'); };
} }));
import { readCommentsPage, readCommentCounts, readCommentParent } from './commentService';
const identity = { expectedOwnerUid: 'alice', expectedProfileId: 'alice-profile' };
const comment = { id: 'comment', postId: 'post', text: 'Private text', imageUrl: null, createdAt: '2026-10-04T12:00:00.000Z', revision: 'a'.repeat(48),
  needsOwnerConfirmation: false, isFlagged: false, safetyScore: 0, safetyCategories: [], likeCount: 2, isLiked: true, user: { id: 'bob-profile', username: 'bob', avatarUrl: null } };
const page = { ok: true, ownerUid: 'alice', profileId: 'alice-profile', postId: 'post', comments: [comment], nextCursor: null };
beforeEach(() => { vi.clearAllMocks(); state.epoch++; state.uid = 'alice'; state.invoke.mockResolvedValue({ data: page }); });
afterEach(() => vi.useRealTimers());
describe('checked comment projections', () => {
  it.each([{ ownerUid: 'bob' }, { profileId: 'bob-profile' }, { postId: 'other' }, { comments: null }, { comments: [comment, comment] },
    { comments: [{ ...comment, postId: 'other' }] }, { comments: [{ ...comment, revision: null }] },
    { comments: [{ ...comment, needsOwnerConfirmation: true, revision: null }] }, { comments: [{ ...comment, imageUrl: 'javascript:alert(1)' }] },
    { comments: [{ ...comment, text: '', imageUrl: null }] }, { comments: [{ ...comment, createdAt: 'yesterday' }] }, { comments: [{ ...comment, user: null }] }])('rejects malformed or cross-boundary pages %j', async patch => {
    state.invoke.mockResolvedValue({ data: { ...page, ...patch } }); await expect(readCommentsPage({ ...identity, postId: 'post' }, () => {})).rejects.toThrow('could not be verified');
  });
  it('accepts an own legacy recovery row only with an explicit unproven marker and null revision', async () => {
    state.invoke.mockResolvedValue({ data: { ...page, comments: [{ ...comment, needsOwnerConfirmation: true, revision: null, user: { ...comment.user, id: 'alice-profile' } }] } });
    expect((await readCommentsPage({ ...identity, postId: 'post' }, () => {})).comments[0].needs_owner_confirmation).toBe(true);
  });
  it('rejects cancelled reads and does not renew a lease based on a delayed response', async () => {
    vi.useFakeTimers(); const started = Date.now(); const controller = new AbortController();
    state.invoke.mockImplementation(async () => { vi.setSystemTime(started + 31000); return { data: page }; });
    const result = await readCommentsPage({ ...identity, postId: 'post' }, () => {}); expect(result.leaseUntil).toBeLessThan(Date.now());
    state.invoke.mockImplementation(async () => { controller.abort(); return { data: page }; });
    await expect(readCommentsPage({ ...identity, postId: 'post' }, () => {}, controller.signal)).rejects.toThrow('closed');
  });
  it('checks parent, requested IDs, missing access and date scope for batched counts', async () => {
    state.invoke.mockImplementation(async (_name, input) => ({ data: { ok: true, ownerUid: 'alice', profileId: 'alice-profile', requestedPostIds: input.postIds, since: input.since ?? null, counts: input.postIds.filter((id: string) => id !== 'hidden').map((postId: string) => ({ postId, count: 2 })) } }));
    const result = await readCommentCounts(['post', 'hidden'], 'alice-profile'); expect(result).toEqual({ post: 2 }); expect(result.hidden).toBeUndefined();
    const ids = Array.from({ length: 25 }, (_, index) => `post-${index}`); await readCommentCounts(ids, 'alice-profile');
    expect(state.invoke.mock.calls.slice(1).map(([, input]) => input.postIds.length)).toEqual([20, 5]);
    state.invoke.mockResolvedValue({ data: { ok: true, ownerUid: 'alice', profileId: 'alice-profile', requestedPostIds: ['post'], since: null, counts: [{ postId: 'foreign', count: 2 }] } });
    await expect(readCommentCounts(['post'], 'alice-profile')).rejects.toThrow('could not be verified');
  });
  it('rejects failed counts rather than fabricating zero and stops after an account change', async () => {
    state.invoke.mockResolvedValue({ error: { name: 'unavailable', message: 'Counts unavailable' } });
    await expect(readCommentCounts(['post'], 'alice-profile')).rejects.toThrow('Counts unavailable');
    state.invoke.mockImplementation(async () => { state.epoch++; return { data: {} }; });
    await expect(readCommentCounts(['post'], 'alice-profile')).rejects.toThrow('Account changed');
  });
  it('accepts unavailable context but rejects a mismatched comment', async () => {
    state.invoke.mockResolvedValue({ data: { ok: true, ownerUid: 'alice', profileId: 'alice-profile', commentId: 'comment', postId: null } });
    expect(await readCommentParent({ ...identity, commentId: 'comment' }, () => {})).toBeNull();
    await expect(readCommentParent({ ...identity, commentId: 'other' }, () => {})).rejects.toThrow('could not be verified');
  });
});
