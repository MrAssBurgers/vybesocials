import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ uid: 'alice', owner: 'alice', auth: null as any, listeners: new Set<(user: any) => void>(), read: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mock.uid ? { id: mock.uid } : null, profile: { id: `${mock.owner}-profile`, user_id: mock.owner } }) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => mock.auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: mock.read }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/commentChanges', () => ({ changeComment: vi.fn(), saveCommentChange: vi.fn() }));
vi.mock('./useVybeTokens', () => ({ useTokenReward: vi.fn() }));
vi.mock('./useReactionStreaks', () => ({ useBumpReactionStreak: vi.fn() }));
vi.mock('@/lib/contentModeration', () => ({ filterBlockedContent: (text: string) => text, containsBlockedContent: vi.fn() }));
vi.mock('@/lib/nsfwScanner', () => ({ scanText: vi.fn() }));
vi.mock('@/hooks/useModeration', () => ({ moderateContent: vi.fn() }));
vi.mock('@/lib/challengeProgressClient', () => ({ recordChallengeActivity: vi.fn() }));
import { useComments } from './useComments';
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
function switchTo(uid: string) { mock.uid = mock.owner = uid; mock.auth.currentUser = uid ? { uid } : null; for (const listener of mock.listeners) listener(mock.auth.currentUser); }
const row = { id: 'comment', postId: 'post', text: 'Private comment', imageUrl: null, createdAt: '2026-10-04T12:00:00.000Z', revision: 'a'.repeat(48), needsOwnerConfirmation: false,
  isFlagged: false, safetyScore: 0, safetyCategories: [], likeCount: 0, isLiked: false, user: { id: 'author', username: 'author', avatarUrl: null } };
const page = (patch = {}) => ({ data: { ok: true, ownerUid: 'alice', profileId: 'alice-profile', postId: 'post', comments: [row], nextCursor: null, ...patch }, error: null });
beforeEach(() => {
  vi.clearAllMocks(); mock.uid = mock.owner = 'alice'; mock.listeners.clear();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  mock.auth = { currentUser: { uid: 'alice' }, onAuthStateChanged: (cb: any) => { mock.listeners.add(cb); return () => mock.listeners.delete(cb); } };
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); mock.read.mockResolvedValue(page());
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); });
it('does not expose cached rows to the next account while its read is pending', async () => {
  const hook = renderHook(() => useComments('post'), { wrapper });
  await waitFor(() => expect(hook.result.current.data?.[0]?.text).toBe('Private comment'));
  const oldKey = hook.result.current.queryKey; mock.read.mockReturnValue(new Promise(() => {}));
  act(() => { switchTo('bob'); });
  expect(hook.result.current.data).toEqual([]); expect(hook.result.current.queryKey).not.toEqual(oldKey);
});
it('drops a late read after an away-and-back switch even when no intermediate account rendered', async () => {
  let finish!: (value: unknown) => void;
  mock.read.mockReturnValue(new Promise(() => {})).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const hook = renderHook(() => useComments('post'), { wrapper }); await waitFor(() => expect(mock.read).toHaveBeenCalledTimes(1));
  const oldKey = hook.result.current.queryKey;
  act(() => { switchTo('bob'); switchTo('alice'); });
  await act(async () => finish(page()));
  expect(hook.result.current.data).toEqual([]); expect(hook.result.current.queryKey).not.toEqual(oldKey); expect(client.getQueryData(oldKey)).toBeUndefined();
});
it('a denied refresh removes previously visible content and remains explicitly retryable', async () => {
  const hook = renderHook(() => useComments('post'), { wrapper }); await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
  mock.read.mockResolvedValue({ error: { message: 'Discussion no longer available', name: 'permission-denied' } });
  await act(async () => { await hook.result.current.refetch(); });
  await waitFor(() => expect(hook.result.current.isError).toBe(true)); expect(hook.result.current.data).toEqual([]);
  mock.read.mockResolvedValue(page()); await act(async () => { await hook.result.current.refetch(); });
  await waitFor(() => expect(hook.result.current.data).toHaveLength(1)); expect(hook.result.current.isError).toBe(false);
});
it('hidden/reopened discussions discard old pages and recheck access', async () => {
  const hook = renderHook(() => useComments('post'), { wrapper }); await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
  act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  expect(hook.result.current.data).toEqual([]); mock.read.mockReturnValue(new Promise(() => {}));
  act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  expect(hook.result.current.data).toEqual([]); await waitFor(() => expect(mock.read).toHaveBeenCalledTimes(2));
});
it('does not keep expired private comments while refresh is stalled', async () => {
  vi.useFakeTimers(); const hook = renderHook(() => useComments('post'), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(10); }); expect(hook.result.current.data).toHaveLength(1);
  mock.read.mockReturnValue(new Promise(() => {}));
  await act(async () => { await vi.advanceTimersByTimeAsync(31000); });
  expect(hook.result.current.data).toEqual([]); expect(hook.result.current.isError).toBe(true);
});
it('paginates past a fully withheld page without treating it as the end', async () => {
  mock.read.mockResolvedValueOnce(page({ comments: [], nextCursor: 'b'.repeat(48) })).mockResolvedValueOnce(page());
  const hook = renderHook(() => useComments('post'), { wrapper }); await waitFor(() => expect(hook.result.current.hasNextPage).toBe(true));
  expect(hook.result.current.data).toEqual([]); await act(async () => { await hook.result.current.fetchNextPage(); });
  await waitFor(() => expect(hook.result.current.data).toHaveLength(1)); expect(hook.result.current.hasNextPage).toBe(false);
  expect(mock.read.mock.calls[1][1].cursor).toBe('b'.repeat(48));
});
it.each(['signed-out','stale-profile','closed'])('does not request comments for %s', async mode => {
  if (mode === 'signed-out') switchTo(''); if (mode === 'stale-profile') mock.owner = 'bob';
  renderHook(() => useComments(mode === 'closed' ? '' : 'post'), { wrapper }); await act(async () => { await Promise.resolve(); }); expect(mock.read).not.toHaveBeenCalled();
});
