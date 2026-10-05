import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ invoke: vi.fn(), counts: vi.fn() }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('./commentService', () => ({ readCommentCounts: (...args: unknown[]) => state.counts(...args) }));
import { readSocialPostList, readSocialPostSummary } from './socialPostListService';
const input = { expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice', scope: 'saved' as const };
const row = { id: 'one', type: 'post', caption: 'Visible caption', createdAt: '2026-10-04T12:00:00.000Z', publicationRevision: 'a'.repeat(48), needsOwnerConfirmation: false, mediaUrl: null, mediaUrls: [], thumbnailUrl: null,
  ageRating: 'safe', tags: ['music'], likeCount: 1, commentCount: 0, viewCount: 2, isPinned: false, isBookmarked: true, reactionType: null,
  author: { id: 'profile-bob', username: 'bob', displayName: 'Bob', avatarUrl: null } };
const receipt = () => ({ ownerUid: 'alice', viewerProfileId: 'profile-alice', selection: { scope: 'saved', targetId: null, search: null, since: null, contentType: null },
  posts: [structuredClone(row)], unavailableSavedPostIds: ['gone'], nextCursor: null as string | null });
beforeEach(() => { vi.restoreAllMocks(); state.invoke.mockReset().mockResolvedValue({ data: receipt() }); state.counts.mockReset().mockResolvedValue({ one: 9 }); });
describe('checked post list transport', () => {
  it('retains owner recovery references without any old payload and starts lease before transport', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    state.invoke.mockImplementation(async () => { clock.mockReturnValue(7000); return { data: receipt() }; });
    const result = await readSocialPostList(input, () => {});
    expect(result).toMatchObject({ unavailableSavedPostIds: ['gone'], leaseUntil: 31000, posts: [{ id: 'one', caption: 'Visible caption', comment_count: 9 }] });
    expect(state.counts).toHaveBeenCalledWith(['one'], 'profile-alice', undefined, expect.any(Function));
  });
  it('newer parent denial from count admission suppresses post content and keeps saved recovery', async () => {
    state.counts.mockResolvedValue({});
    expect(await readSocialPostList(input, () => {})).toMatchObject({ posts: [], unavailableSavedPostIds: ['gone', 'one'] });
    state.counts.mockRejectedValue(new Error('Count read failed'));
    await expect(readSocialPostList(input, () => {})).rejects.toThrow('Count read failed');
  });
  it.each([
    { ownerUid: 'bob' }, { viewerProfileId: 'old-profile' }, { selection: { ...receipt().selection, scope: 'search' } },
    { posts: [row, row] }, { posts: [{ ...row, mediaUrl: 'https://password:secret@example.test/a.png' }] },
    { posts: [{ ...row, caption: '', mediaUrl: null }] }, { unavailableSavedPostIds: ['one'] }, { unavailableSavedPostIds: ['gone', 'gone'] },
    { extraPrivateNotes: 'never render' }, { posts: [{ ...row, privateField: 'never render' }] },
    { posts: [{ ...row, publicationRevision: undefined }] }, { posts: [{ ...row, publicationRevision: 'unproven' }] },
    { posts: [{ ...row, needsOwnerConfirmation: true }] },
  ])('rejects malformed or foreign receipt %#', async patch => {
    state.invoke.mockResolvedValue({ data: { ...receipt(), ...patch } });
    await expect(readSocialPostList(input, () => {})).rejects.toThrow(/verified/);
  });
  it('preserves failures, changed-account results and filtered page cursors', async () => {
    state.invoke.mockResolvedValue({ error: { code: 'permission-denied', message: 'Access changed' } });
    await expect(readSocialPostList(input, () => {})).rejects.toMatchObject({ code: 'permission-denied' });
    const cursor = 'a'.repeat(48); state.invoke.mockResolvedValue({ data: { ...receipt(), posts: [], nextCursor: cursor } });
    expect(await readSocialPostList(input, () => {})).toMatchObject({ posts: [], nextCursor: cursor });
    await expect(readSocialPostList({ ...input, cursor }, () => {})).rejects.toThrow(/verified/);
    const guard = vi.fn().mockImplementationOnce(() => {}).mockImplementation(() => { throw new Error('Account changed'); });
    await expect(readSocialPostList(input, guard)).rejects.toThrow('Account changed');
  });
  it('summary deduplicates pinned rows, admits only returned tags and distinguishes lower bounds', async () => {
    const first = receipt(); first.nextCursor = 'a'.repeat(48);
    state.invoke.mockResolvedValueOnce({ data: first }).mockResolvedValueOnce({ data: { ...receipt(), posts: [row, { ...row, id: 'two' }] } });
    expect(await readSocialPostSummary(input, () => {})).toMatchObject({ count: 2, hasMore: false, tags: [['music', 2]] });
    let sequence = 0;
    state.invoke.mockImplementation(async () => ({ data: { ...receipt(), nextCursor: (++sequence).toString(16).padStart(48, '0') } }));
    expect(await readSocialPostSummary(input, () => {})).toMatchObject({ count: 1, hasMore: true });
    expect(sequence).toBe(3);
    expect(state.counts).not.toHaveBeenCalled();
  });
});
