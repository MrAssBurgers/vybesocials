import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ invoke: vi.fn(), feed: vi.fn() }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('@/lib/firebase/feedRpc', () => ({ runFeedRpc: (...args: unknown[]) => state.feed(...args) }));
import { readSocialFeed, readSocialPostPreviews } from './socialFeedService';

const input = { expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice', contentType: 'post' as const };
const post = { id: 'post-one', type: 'post', caption: 'Hello', createdAt: '2026-10-04T12:00:00.000Z',
  mediaUrl: null, mediaUrls: [], thumbnailUrl: null, ageRating: 'unrated', tags: ['gaming'],
  likeCount: 7, commentCount: 2, viewCount: 30, isPinned: false, isBookmarked: true, reactionType: 'love',
  author: { id: 'profile-bob', username: 'bob', displayName: 'Bob', avatarUrl: null } };
const response = () => ({ ownerUid: 'alice', viewerProfileId: 'profile-alice', contentType: 'post', feed: 'discover', posts: [structuredClone(post)], nextCursor: null as string | null });
beforeEach(() => { state.feed.mockReset(); state.invoke.mockReset(); state.invoke.mockResolvedValue({ data: response(), error: null }); });

describe('known-ID social preview transport', () => {
  const selection = { expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice', postIds: ['post-one', 'missing'] };
  const preview = () => { const { reactionType: _reaction, isBookmarked: _saved, ...row } = structuredClone(post); return row; };
  const receipt = () => ({ ownerUid: 'alice', viewerProfileId: 'profile-alice', requestedPostIds: selection.postIds, posts: [preview()] });
  it('accepts admitted subsets without inventing missing previews or interaction state', async () => {
    state.invoke.mockResolvedValue({ data: receipt() }); const guard = vi.fn();
    expect(await readSocialPostPreviews(selection, guard)).toEqual([preview()]);
    expect(guard).toHaveBeenCalledTimes(2);
    expect(state.invoke).toHaveBeenCalledWith('readSocialPostPreviews', selection);
  });
  it.each([
    { ownerUid: 'bob' }, { viewerProfileId: 'old-profile' }, { requestedPostIds: ['missing', 'post-one'] },
    { posts: [{ ...preview(), id: 'unsolicited' }] }, { posts: [preview(), preview()] },
    { posts: [{ ...preview(), mediaUrl: 'javascript:alert(1)' }] }, { privateNotes: 'unexpected' },
    { posts: [{ ...preview(), type: 'video', mediaUrl: null }] },
  ])('rejects mismatched or malformed preview receipt %#', async patch => {
    state.invoke.mockResolvedValue({ data: { ...receipt(), ...patch } });
    await expect(readSocialPostPreviews(selection, () => {})).rejects.toThrow(/verified/);
  });
  it('rejects invalid selection before transport and late-account or failed responses without fallback', async () => {
    for (const postIds of [[], ['same', 'same'], ['bad/path'], Array.from({ length: 21 }, (_, i) => `post-${i}`)]) {
      await expect(readSocialPostPreviews({ ...selection, postIds }, () => {})).rejects.toThrow();
    }
    expect(state.invoke).not.toHaveBeenCalled();
    state.invoke.mockResolvedValue({ data: receipt(), error: { code: 'unavailable', message: 'Offline' } });
    await expect(readSocialPostPreviews(selection, () => {})).rejects.toThrow('Offline');
    const guard = vi.fn().mockImplementationOnce(() => {}).mockImplementation(() => { throw new Error('Account changed'); });
    await expect(readSocialPostPreviews(selection, guard)).rejects.toThrow('Account changed');
  });
});

describe('current account social feed transport', () => {
  it('binds Local receipts to the selected coarse area before showing posts', async () => {
    const area = { lat: 41.9, lng: -87.6 };
    const localInput = { ...input, feed: 'local' as const, area };
    state.invoke.mockResolvedValue({ data: { ...response(), feed: 'local', area } });
    expect((await readSocialFeed(localInput, () => {})).posts).toHaveLength(1);
    state.invoke.mockResolvedValue({ data: { ...response(), feed: 'local', area: { lat: 42, lng: -87.6 } } });
    await expect(readSocialFeed(localInput, () => {})).rejects.toThrow();
    state.invoke.mockClear();
    await expect(readSocialFeed({ ...localInput, area: { lat: 41.878, lng: -87.6 } }, () => {})).rejects.toThrow();
    await expect(readSocialFeed({ ...input, area }, () => {})).rejects.toThrow();
    expect(state.invoke).not.toHaveBeenCalled();
  });
  it('preserves approved presentation, reaction and bookmark controls without a raw-post fallback', async () => {
    const guard = vi.fn(); const result = await readSocialFeed(input, guard);
    expect(guard).toHaveBeenCalledTimes(2);
    expect(state.invoke).toHaveBeenCalledExactlyOnceWith('readSocialFeed', input);
    expect(result.posts[0]).toMatchObject({ id: 'post-one', like_count: 7, comment_count: 2, is_liked: true, reaction_type: 'love', is_bookmarked: true, age_rating: 'unrated' });
  });
  it.each([
    (page: ReturnType<typeof response>) => { page.ownerUid = 'bob'; },
    (page: ReturnType<typeof response>) => { page.viewerProfileId = 'old-profile'; },
    (page: ReturnType<typeof response>) => { page.contentType = 'short'; },
    (page: ReturnType<typeof response>) => { page.feed = 'following'; },
    (page: ReturnType<typeof response>) => { page.posts.push(page.posts[0]); },
    (page: ReturnType<typeof response>) => { page.posts[0].type = 'video'; },
    (page: ReturnType<typeof response>) => { page.posts[0].likeCount = -1; },
    (page: ReturnType<typeof response>) => { page.posts[0].caption = ''; },
    (page: ReturnType<typeof response>) => { page.posts[0].author.username = '   '; },
    (page: ReturnType<typeof response>) => { Object.assign(page.posts[0], { mediaUrl: 'not a URL' }); },
    (page: ReturnType<typeof response>) => { Object.assign(page.posts[0], { mediaUrl: 'https://secret:pass@example.test/x' }); },
    (page: ReturnType<typeof response>) => { Object.assign(page.posts[0], { privateNotes: 'unexpected' }); },
  ])('rejects mismatched or malformed server receipts', async mutate => {
    const page = response(); mutate(page); state.invoke.mockResolvedValue({ data: page });
    await expect(readSocialFeed(input, () => {})).rejects.toThrow(/verified/);
  });
  it('retains continuation through a filtered empty page and rejects repeated cursor', async () => {
    const cursor = 'a'.repeat(48); state.invoke.mockResolvedValue({ data: { ...response(), posts: [], nextCursor: cursor } });
    expect(await readSocialFeed(input, () => {})).toMatchObject({ posts: [], nextCursor: cursor, leaseUntil: expect.any(Number) });
    await expect(readSocialFeed({ ...input, cursor }, () => {})).rejects.toThrow(/verified/);
  });
  it('propagates failed reads instead of turning them into an empty feed', async () => {
    state.invoke.mockResolvedValue({ error: { code: 'permission-denied', message: 'Access changed' }, data: response() });
    await expect(readSocialFeed(input, () => {})).rejects.toMatchObject({ code: 'permission-denied', message: 'Access changed' });
    expect(state.invoke).toHaveBeenCalledTimes(1);
    expect(state.feed).not.toHaveBeenCalled();
  });
  it.each(['not-found', 'permission-denied', 'unauthenticated', 'invalid-argument', 'unavailable'])('never uses raw candidates when reader fails: %s', async code => {
    state.invoke.mockResolvedValue({ error: { code, message: 'Feed unavailable' } });
    await expect(readSocialFeed(input, () => {})).rejects.toMatchObject({ code });
    expect(state.feed).not.toHaveBeenCalled(); expect(state.invoke).toHaveBeenCalledTimes(1);
  });
  it('starts the visible lease before transport, so slow reads do not extend access', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    state.invoke.mockImplementation(async () => { now.mockReturnValue(15000); return { data: response() }; });
    expect((await readSocialFeed(input, () => {})).leaseUntil).toBe(31000); now.mockRestore();
  });
  it('denies before transport and after an account changes in flight', async () => {
    const stale = () => { throw new Error('Account changed'); };
    await expect(readSocialFeed(input, stale)).rejects.toThrow('Account changed'); expect(state.invoke).not.toHaveBeenCalled();
    const guard = vi.fn().mockImplementationOnce(() => {}).mockImplementation(stale);
    await expect(readSocialFeed(input, guard)).rejects.toThrow('Account changed');
  });
});
