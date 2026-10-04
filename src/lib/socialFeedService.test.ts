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
    expect(await readSocialFeed(input, () => {})).toEqual({ posts: [], nextCursor: cursor });
    await expect(readSocialFeed({ ...input, cursor }, () => {})).rejects.toThrow(/verified/);
  });
  it('propagates failed reads instead of turning them into an empty feed', async () => {
    state.invoke.mockResolvedValue({ error: { code: 'permission-denied', message: 'Access changed' }, data: response() });
    await expect(readSocialFeed(input, () => {})).rejects.toMatchObject({ code: 'permission-denied', message: 'Access changed' });
    expect(state.invoke).toHaveBeenCalledTimes(1);
    expect(state.feed).not.toHaveBeenCalled();
  });
  it('displays admitted discovery content when the primary reader is missing', async () => {
    const { reactionType: _reaction, isBookmarked: _saved, ...approved } = post;
    state.invoke.mockResolvedValueOnce({ error: { name: 'not-found', message: 'NOT_FOUND' }, data: null }).mockResolvedValueOnce({ data: { ownerUid: 'alice', viewerProfileId: 'profile-alice', requestedPostIds: ['post-live'], posts: [{ ...approved, id: 'post-live' }] } });
    state.feed.mockResolvedValue([{
      id: 'post-live', type: 'post', caption: 'Hi', created_at: '2026-10-04T12:00:00.000Z',
      author_id: 'profile-bob', author_username: 'bob', media_url: 'https://cdn.example/a.jpg',
      like_count: 1, comment_count: 0, is_liked: true, is_bookmarked: false,
    }]);
    const page = await readSocialFeed(input, () => {});
    expect(state.feed).toHaveBeenCalledWith('get_posts_with_counts', expect.objectContaining({ p_offset: 0, p_limit: 15 }));
    expect(page.posts[0]).toMatchObject({ id: 'post-live', caption: 'Hello', media_url: '', author: { username: 'bob' }, is_liked: true, reaction_type: 'like' });
    expect(state.invoke).toHaveBeenLastCalledWith('readSocialPostPreviews', { expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice', postIds: ['post-live'] });
    expect(page.nextCursor).toBeNull();
  });
  it.each(['local', 'following', 'personalized'] as const)('never substitutes the general timeline for %s', async feed => {
    state.invoke.mockResolvedValue({ error: { name: 'not-found' } });
    await expect(readSocialFeed({ ...input, feed, ...(feed === 'local' ? { area: { lat: 41.9, lng: -87.6 } } : {}) }, () => {})).rejects.toThrow('temporarily unavailable');
    expect(state.feed).not.toHaveBeenCalled();
  });
  it.each(['permission-denied', 'unauthenticated', 'invalid-argument', 'unavailable'])('never falls back on %s even when the message mentions 404', async code => {
    state.invoke.mockResolvedValue({ error: { code, message: '404 profile not found' } });
    await expect(readSocialFeed(input, () => {})).rejects.toMatchObject({ code });
    expect(state.feed).not.toHaveBeenCalled();
  });
  it('does not display a candidate rejected by current audience checks', async () => {
    state.feed.mockResolvedValue([{ id: 'private', author_id: 'bob', caption: 'Private snapshot', media_url: 'https://example.test/private.jpg' }]);
    state.invoke.mockResolvedValueOnce({ error: { name: 'not-found' } }).mockResolvedValueOnce({ data: { ownerUid: 'alice', viewerProfileId: 'profile-alice', requestedPostIds: ['private'], posts: [] } });
    expect(await readSocialFeed(input, () => {})).toEqual({ posts: [], nextCursor: null });
  });
  it('does not display raw candidates when preview admission is also unavailable', async () => {
    state.feed.mockResolvedValue([{ id: 'private', author_id: 'bob', caption: 'Private snapshot' }]);
    state.invoke.mockResolvedValue({ error: { name: 'not-found', message: 'Not deployed' } });
    await expect(readSocialFeed(input, () => {})).rejects.toThrow('Not deployed');
    expect(state.invoke).toHaveBeenCalledTimes(2);
  });
  it('finishes admitted legacy pagination without sending its offset to the primary reader', async () => {
    const { reactionType: _reaction, isBookmarked: _saved, ...approved } = post;
    state.feed.mockResolvedValue([{ id: 'post-one', author_id: 'profile-bob', caption: 'Old caption' }]);
    state.invoke.mockResolvedValue({ data: { ownerUid: 'alice', viewerProfileId: 'profile-alice', requestedPostIds: ['post-one'], posts: [approved] } });
    const result = await readSocialFeed({ ...input, cursor: 'c:15' }, () => {});
    expect(state.feed).toHaveBeenCalledWith('get_posts_with_counts', expect.objectContaining({ p_offset: 15 }));
    expect(state.invoke).toHaveBeenCalledTimes(1);
    expect(state.invoke).toHaveBeenCalledWith('readSocialPostPreviews', expect.any(Object));
    expect(result.posts[0].caption).toBe('Hello');
  });
  it('denies before transport and after an account changes in flight', async () => {
    const stale = () => { throw new Error('Account changed'); };
    await expect(readSocialFeed(input, stale)).rejects.toThrow('Account changed'); expect(state.invoke).not.toHaveBeenCalled();
    const guard = vi.fn().mockImplementationOnce(() => {}).mockImplementation(stale);
    await expect(readSocialFeed(input, guard)).rejects.toThrow('Account changed');
  });
});
