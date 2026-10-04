import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: { uid: 'alice' as string | null, epoch: 1 }, uiUid: 'alice', read: vi.fn(), friends: vi.fn(), change: vi.fn(), views: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uiUid }, profile: { id: `p-${state.uiUid}`, user_id: state.uiUid } }) }));
vi.mock('./useReportAccountSession', () => ({ useReportAccountSession: () => state.session }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session, reportAccountGuard: (uid: string) => {
  const epoch = state.session.epoch; return () => { if (!uid || state.session.uid !== uid || state.session.epoch !== epoch) throw new Error('Account changed'); };
} }));
vi.mock('@/lib/firebase', () => ({ db: { from: () => ({ select: () => ({ eq: state.views }) }) } }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => `p-${state.uiUid}` }));
vi.mock('@/lib/resolveSessionProfileId', () => ({ resolveStoryAuthorProfileId: vi.fn() }));
vi.mock('@/lib/storyPublishService', () => ({ publishStory: vi.fn() }));
vi.mock('@/lib/storyReadService', () => ({ listVisibleStories: (...args: unknown[]) => state.read(...args) }));
vi.mock('@/lib/closeFriendsService', () => ({ listVerifiedCloseFriends: (...args: unknown[]) => state.friends(...args), changeVerifiedCloseFriend: (...args: unknown[]) => state.change(...args) }));
import { useCloseFriends, useManageCloseFriend, useStories } from './useStories';
import { useVisibleStory } from './useVisibleStory';
const story = { id: 'story', author_id: 'p-bob', media_url: 'https://example.invalid/secret', media_type: 'image', caption: 'Private', is_close_friends_only: true,
  created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60000).toISOString(), author: { id: 'p-bob', username: 'bob', avatar_url: null, display_name: null } };
const bob = { id: 'p-bob', username: 'bob', display_name: null, avatar_url: null };
const page = { stories: [story], nextCursor: null };
const friends = { friends: [], candidates: [bob], candidateNextCursor: null, legacyReview: true };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }; }
beforeEach(() => { vi.clearAllMocks(); state.session = { uid: 'alice', epoch: 1 }; state.uiUid = 'alice'; state.views.mockResolvedValue({ data: [], error: null });
  state.read.mockImplementation(async (_input, guard) => { guard(); return page; }); state.friends.mockResolvedValue(friends); state.change.mockResolvedValue({ success: true }); });
afterEach(cleanup);
describe('current audience story reads', () => {
  it('does not issue reads while React and Firebase accounts differ, then starts when ready', async () => {
    state.session = { uid: null, epoch: 0 }; const { wrapper } = fixture(); const { result, rerender } = renderHook(() => useStories(), { wrapper });
    expect(result.current.data).toEqual([]); expect(state.read).not.toHaveBeenCalled();
    state.session = { uid: 'alice', epoch: 1 }; rerender(); await waitFor(() => expect(result.current.data[0]?.stories[0].id).toBe('story'));
    expect(state.read.mock.calls[0][0]).toEqual({ expectedOwnerUid: 'alice', expectedProfileId: 'p-alice' });
  });
  it('masks prior stories after denied refetch and after Alice–Bob–Alice without restoring the old cache', async () => {
    const { wrapper } = fixture(); const { result, rerender } = renderHook(() => useStories(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1)); state.read.mockRejectedValue(new Error('Denied'));
    await act(async () => { await result.current.refetch(); }); await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.data).toEqual([]);
    state.session = { uid: 'bob', epoch: 2 }; state.uiUid = 'bob'; rerender(); expect(result.current.data).toEqual([]);
    state.session = { uid: 'alice', epoch: 3 }; state.uiUid = 'alice'; rerender(); expect(result.current.data).toEqual([]);
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
  it('rejects an old audience response before reading markers or rendering media', async () => {
    const pending = deferred<typeof page>(); state.read.mockImplementation(async (_input, guard) => { guard(); const value = await pending.promise; guard(); return value; });
    const { wrapper } = fixture(); const { result, rerender } = renderHook(() => useStories(), { wrapper });
    await waitFor(() => expect(state.read).toHaveBeenCalled()); state.session = { uid: 'bob', epoch: 2 }; rerender();
    await act(async () => { pending.resolve(page); }); expect(result.current.data).toEqual([]); expect(state.views).not.toHaveBeenCalled();
  });
  it('continues past an empty author page and deduplicates stories across pages', async () => {
    state.read.mockResolvedValueOnce({ stories: [], nextCursor: 'next' }).mockResolvedValueOnce({ stories: [story, story], nextCursor: null });
    const { wrapper } = fixture(); const { result } = renderHook(() => useStories(), { wrapper });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true)); expect(result.current.data).toEqual([]);
    await act(async () => { await result.current.fetchNextPage(); }); await waitFor(() => expect(result.current.data[0]?.stories).toHaveLength(1));
    expect(state.read.mock.calls[1][0]).toMatchObject({ cursor: 'next' });
  });
  it('requires a fresh exact-ID response before exposing even a same-session cached viewer image', async () => {
    const { wrapper, client } = fixture(); client.setQueryData(['visible-story', 'story', 'p-alice', 'alice', 1], story);
    const pending = deferred<typeof page>(); state.read.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useVisibleStory('story'), { wrapper }); expect(result.current.data).toBeUndefined();
    await act(async () => { pending.resolve({ stories: [], nextCursor: null }); }); await waitFor(() => expect(result.current.isLoading).toBe(false)); expect(result.current.data).toBeNull();
    expect(state.read.mock.calls[0][0]).toMatchObject({ storyIds: ['story'] });
  });
  it('removes the authorized viewer row on an unavailable recheck', async () => {
    const { wrapper } = fixture(); const { result } = renderHook(() => useVisibleStory('story'), { wrapper });
    await waitFor(() => expect(result.current.data?.id).toBe('story')); state.read.mockRejectedValue(new Error('Denied'));
    await act(async () => { await result.current.refetch(); }); await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.data).toBeUndefined();
  });
});
describe('protected Close Friends selections', () => {
  it('loads further empty/duplicate candidate pages while keeping legacy entries unselected', async () => {
    state.friends.mockResolvedValueOnce({ ...friends, candidates: [], candidateNextCursor: 'first' }).mockResolvedValueOnce({ ...friends, candidates: [bob, bob] });
    const { wrapper } = fixture(); const { result } = renderHook(useCloseFriends, { wrapper });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true)); expect(result.current.data).toEqual([]); expect(result.current.legacyReview).toBe(true);
    await act(async () => { await result.current.fetchNextPage(); }); await waitFor(() => expect(result.current.candidates).toEqual([bob]));
    expect(state.friends.mock.calls[1][0]).toMatchObject({ cursor: 'first' }); expect(state.change).not.toHaveBeenCalled();
  });
  it('masks selected names and candidates when the current list fails', async () => {
    state.friends.mockResolvedValue({ ...friends, friends: [{ id: 'proof', friend: bob }] });
    const { wrapper } = fixture(); const { result } = renderHook(useCloseFriends, { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1)); state.friends.mockRejectedValue(new Error('Denied'));
    await act(async () => { await result.current.refetch(); }); await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.data).toBeUndefined(); expect(result.current.candidates).toEqual([]);
  });
  it('old mutation closures cannot add a close friend after an ABA account switch', async () => {
    const { wrapper } = fixture(); const { result } = renderHook(useManageCloseFriend, { wrapper }); const change = result.current.mutateAsync;
    state.session = { uid: 'alice', epoch: 3 };
    await act(async () => { await expect(change({ friendId: 'p-bob', action: 'add' })).rejects.toThrow('Account changed'); }); expect(state.change).not.toHaveBeenCalled();
  });
});
