import { beforeEach, describe, expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: invoke }));
import { listVisibleStories } from './storyReadService';
import { changeVerifiedCloseFriend, listVerifiedCloseFriends } from './closeFriendsService';
const owner = { expectedOwnerUid: 'alice', expectedProfileId: 'p-alice' };
const story = { id: 's1', author_id: 'p-bob', media_url: 'https://example.invalid/private.jpg', media_type: 'image', caption: null,
  is_close_friends_only: true, view_count: 0, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60000).toISOString(),
  author: { id: 'p-bob', username: 'bob', avatar_url: null, display_name: null } };
const reply = (extra = {}) => ({ data: { success: true, ownerUid: 'alice', profileId: 'p-alice', stories: [story], nextCursor: null, ...extra }, error: null });
beforeEach(() => { vi.clearAllMocks(); invoke.mockResolvedValue(reply()); });
describe('current-viewer story response contracts', () => {
  it('sends only the captured viewer and exact selection, with checks around the await', async () => {
    const guard = vi.fn(); await expect(listVisibleStories({ ...owner, storyIds: ['s1'] }, guard)).resolves.toMatchObject({ stories: [story] });
    expect(invoke).toHaveBeenCalledWith('listVisibleStories', { ...owner, storyIds: ['s1'] }); expect(guard).toHaveBeenCalledTimes(2);
  });
  it.each([{ ownerUid: 'bob' }, { profileId: 'p-bob' }, { stories: [{ ...story, author: { ...story.author, id: 'wrong' } }] }, { success: false }])('rejects a response with unbound identity %j', async extra => {
    invoke.mockResolvedValue(reply(extra)); await expect(listVisibleStories(owner, () => {})).rejects.toThrow('verified');
  });
  it('rejects another selected ID, a foreign author and a stuck cursor', async () => {
    await expect(listVisibleStories({ ...owner, storyIds: ['other'] }, () => {})).rejects.toThrow('selection');
    await expect(listVisibleStories({ ...owner, authorId: 'p-other' }, () => {})).rejects.toThrow('profile');
    invoke.mockResolvedValue(reply({ nextCursor: 'cursor' })); await expect(listVisibleStories({ ...owner, cursor: 'cursor' }, () => {})).rejects.toThrow('advance');
  });
  it('retains a next page even when no stories in the current author page are visible', async () => {
    invoke.mockResolvedValue(reply({ stories: [], nextCursor: 'next' })); await expect(listVisibleStories(owner, () => {})).resolves.toEqual({ stories: [], nextCursor: 'next' });
  });
  it('does not return captured media after an account change during a request', async () => {
    const guard = vi.fn().mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('Account changed'); });
    await expect(listVisibleStories(owner, guard)).rejects.toThrow('Account changed');
  });
  it('fails closed on missing callable and permission failures', async () => {
    invoke.mockResolvedValue({ data: null, error: { code: 'permission-denied' } });
    await expect(listVisibleStories(owner, () => {})).rejects.toMatchObject({ code: 'permission-denied' }); expect(invoke).toHaveBeenCalledTimes(1);
  });
});
describe('trusted Close Friends contracts', () => {
  const friends = { success: true, ownerUid: 'alice', profileId: 'p-alice', friends: [], legacyReview: true, candidates: [], candidateNextCursor: 'next' };
  it('accepts an empty candidate page with continuation without importing legacy entries', async () => {
    invoke.mockResolvedValue({ data: friends, error: null });
    await expect(listVerifiedCloseFriends(owner, () => {})).resolves.toMatchObject({ friends: [], legacyReview: true, candidateNextCursor: 'next' });
    expect(invoke).toHaveBeenCalledWith('manageCloseFriends', { ...owner, action: 'list' });
  });
  it('rejects foreign list identity and nonadvancing pages', async () => {
    invoke.mockResolvedValue({ data: { ...friends, ownerUid: 'bob' }, error: null }); await expect(listVerifiedCloseFriends(owner, () => {})).rejects.toThrow('confirmed');
    invoke.mockResolvedValue({ data: friends, error: null }); await expect(listVerifiedCloseFriends({ ...owner, cursor: 'next' }, () => {})).rejects.toThrow('advance');
  });
  it('requires an actual matching mutation receipt', async () => {
    invoke.mockResolvedValue({ data: { success: true, ownerUid: 'alice', profileId: 'p-alice', action: 'remove', friendId: 'other' }, error: null });
    await expect(changeVerifiedCloseFriend({ ...owner, action: 'remove', friendId: 'p-bob' }, () => {})).rejects.toThrow('not confirmed');
  });
});
