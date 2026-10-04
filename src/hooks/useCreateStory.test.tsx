import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, publish: vi.fn(), author: vi.fn(), view: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: { id: `${state.uid}-profile`, user_id: state.uid, username: state.uid } }) }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => `${state.uid}-profile` }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: state.uid, epoch: state.epoch }) }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => ({ uid: state.uid, epoch: state.epoch }), reportAccountGuard: (uid: string) => { const epoch = state.epoch; return () => {
  if (state.uid !== uid || state.epoch !== epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' });
}; } }));
vi.mock('@/lib/storyPublishService', () => ({ publishStory: state.publish }));
vi.mock('@/lib/firebase', () => ({ db: { from: () => ({ upsert: state.view }) } }));
vi.mock('@/lib/resolveSessionProfileId', () => ({ resolveStoryAuthorProfileId: state.author }));
vi.mock('@/lib/profileCache', () => ({ getEffectiveProfileId: (id: string) => id }));
vi.mock('@/lib/dmMembershipRepair', () => ({ resolveAuthorIds: vi.fn(), fetchMemberProfiles: vi.fn() }));
vi.mock('@/lib/storiesCacheSanitize', () => ({ normalizeStoryGroups: (value: unknown) => Array.isArray(value) ? value : [], purgeStuckStoryUploads: vi.fn() }));
import { useCreateStory, useViewStory } from './useStories';
const input = (requestId = 'draft') => ({ expectedOwnerUid: 'alice', requestId, mediaUrl: 'https://media.test/photo.jpg', mediaType: 'image' as const });
const story = { id: 'confirmed', author_id: 'alice-profile', media_url: input().mediaUrl, media_type: 'image', caption: null, is_close_friends_only: false, view_count: 0, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86_400_000).toISOString(), author: { id: 'alice-profile', username: 'Alice', avatar_url: null, display_name: null } };
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const setup = () => { const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  const hook = renderHook(() => useCreateStory(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }); return { ...hook, client }; };
beforeEach(() => { state.uid = 'alice'; state.epoch = 1; state.view.mockReset(); state.view.mockResolvedValue({ error: null }); state.publish.mockReset(); state.author.mockReset(); state.author.mockResolvedValue('alice-profile'); state.publish.mockResolvedValue({ story, created: true }); });
describe('create story account and cache lifetime', () => {
  it('publishes via the callable and replaces only its own optimistic row after acknowledgement', async () => {
    const { result, client, unmount } = setup(); await act(async () => { await result.current.mutateAsync(input()); });
    expect(state.publish).toHaveBeenCalledWith(expect.objectContaining({ expectedOwnerUid: 'alice', requestId: 'draft', authorId: 'alice-profile', accountGuard: expect.any(Function) }));
    expect(client.getQueryData(['stories', 'alice-profile', 'alice', 1])).toMatchObject({ pages: [{ stories: [expect.objectContaining({ id: 'confirmed', isOptimistic: false })] }] }); unmount(); client.clear();
  });
  it('does not publish after a profile lookup crosses an account boundary', async () => {
    const lookup = deferred<string>(); state.author.mockReturnValue(lookup.promise); const { result, client, unmount } = setup();
    let promise!: Promise<unknown>; act(() => { promise = result.current.mutateAsync(input()); }); await waitFor(() => expect(state.author).toHaveBeenCalled());
    state.uid = 'bob'; state.epoch++; lookup.resolve('alice-profile'); await expect(promise).rejects.toMatchObject({ code: 'account-changed' });
    expect(state.publish).not.toHaveBeenCalled(); expect(client.getQueryCache().getAll()).toHaveLength(0); unmount(); client.clear();
  });
  it.each([false, true])('suppresses stale success/cache writes after an account change, ABA=%s', async aba => {
    const publish = deferred<unknown>(); state.publish.mockReturnValue(publish.promise); const { result, client, unmount } = setup();
    let promise!: Promise<unknown>; act(() => { promise = result.current.mutateAsync(input()); }); await waitFor(() => expect(state.publish).toHaveBeenCalled());
    state.uid = 'bob'; state.epoch++; if (aba) { state.uid = 'alice'; state.epoch++; } client.removeQueries({ queryKey: ['stories'] });
    publish.resolve({ story, created: true }); await expect(promise).rejects.toMatchObject({ code: 'account-changed' }); expect(client.getQueryCache().getAll()).toHaveLength(0); unmount(); client.clear();
  });
  it('rolls back one failed attempt without erasing another confirmed story', async () => {
    const publish = deferred<unknown>(); state.publish.mockReturnValueOnce(publish.promise); const { result, client, unmount } = setup();
    let promise!: Promise<unknown>; act(() => { promise = result.current.mutateAsync(input('first')); }); await waitFor(() => expect(state.publish).toHaveBeenCalled());
    await act(async () => { await result.current.mutateAsync(input('second')); }); publish.reject(new Error('Unavailable')); await expect(promise).rejects.toThrow('Unavailable');
    expect(client.getQueryData(['stories', 'alice-profile', 'alice', 1])).toMatchObject({ pages: [{ stories: [expect.objectContaining({ id: 'confirmed' })] }] }); unmount(); client.clear();
  });
  it('does not update cached confirmation after the composer unmounts', async () => {
    const publish = deferred<unknown>(); state.publish.mockReturnValue(publish.promise); const { result, client, unmount } = setup();
    let promise!: Promise<unknown>; act(() => { promise = result.current.mutateAsync(input()); }); await waitFor(() => expect(state.publish).toHaveBeenCalled());
    unmount(); client.clear(); publish.resolve({ story, created: true }); await expect(promise).rejects.toMatchObject({ code: 'account-changed' }); expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
  it('preserves loaded story pages and raw continuation while inserting confirmed publication', async () => {
    const { result, client, unmount } = setup();
    client.setQueryData(['stories', 'alice-profile', 'alice', 1], { pages: [{ stories: [{ ...story, id: 'old' }], nextCursor: 'friend' }, { stories: [{ ...story, id: 'later' }], nextCursor: 'next-friend' }], pageParams: [null, 'friend'] });
    await act(async () => { await result.current.mutateAsync(input()); });
    expect(client.getQueryData(['stories', 'alice-profile', 'alice', 1])).toMatchObject({ pages: [{ stories: [{ id: 'confirmed' }, { id: 'old' }], nextCursor: 'friend' }, { stories: [{ id: 'later' }], nextCursor: 'next-friend' }], pageParams: [null, 'friend'] }); unmount(); client.clear();
  });
  it('keeps a late failed view marker from restoring content after account ABA', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const hook = renderHook(() => useViewStory(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    const pending = deferred<{ error: Error }>(); state.view.mockReturnValue(pending.promise);
    client.setQueryData(['stories', 'alice-profile', 'alice', 1], { pages: [{ stories: [story], nextCursor: null }], pageParams: [null] });
    let promise!: Promise<unknown>; act(() => { promise = hook.result.current.mutateAsync(story.id); }); await waitFor(() => expect(state.view).toHaveBeenCalled());
    state.epoch += 2; client.clear(); pending.resolve({ error: new Error('Denied') }); await expect(promise).rejects.toMatchObject({ code: 'account-changed' });
    expect(client.getQueryCache().getAll()).toHaveLength(0); hook.unmount(); client.clear();
  });
});
