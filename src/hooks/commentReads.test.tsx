import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ uid: 'alice', owner: 'alice', auth: null as any, listener: null as any, read: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mock.uid ? { id: mock.uid } : null, profile: { id: `${mock.owner}-profile`, user_id: mock.owner } }) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => mock.auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { from: (table: string) => { const chain: any = { select: () => chain, eq: () => chain, order: () => chain, in: () => chain, then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) => Promise.resolve(mock.read(table)).then(resolve,reject) }; return chain; } } }));
vi.mock('@/lib/commentChanges', () => ({ changeComment: vi.fn() }));
vi.mock('./useVybeTokens', () => ({ useTokenReward: vi.fn() }));
vi.mock('./useReactionStreaks', () => ({ useBumpReactionStreak: vi.fn() }));
vi.mock('@/lib/contentModeration', () => ({ filterBlockedContent: (text: string) => text, containsBlockedContent: vi.fn() }));
vi.mock('@/lib/nsfwScanner', () => ({ scanText: vi.fn() }));
vi.mock('@/hooks/useModeration', () => ({ moderateContent: vi.fn() }));
vi.mock('@/lib/challengeProgressClient', () => ({ recordChallengeActivity: vi.fn() }));
import { useComments } from './useComments';
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
function switchTo(uid: string) { mock.uid = mock.owner = uid; mock.auth.currentUser = uid ? { uid } : null; mock.listener?.(mock.auth.currentUser); }
const row = { id: 'comment', text: 'Hello', image_url: null, user: { id: 'author', username: 'author' } };
beforeEach(() => {
  vi.clearAllMocks(); mock.uid = mock.owner = 'alice'; mock.listener = null;
  mock.auth = { currentUser: { uid: 'alice' }, onAuthStateChanged: (cb: unknown) => { mock.listener = cb; return () => {}; } };
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mock.read.mockImplementation(table => ({ data: table === 'comments' ? [row] : [], error: null }));
});
afterEach(() => { cleanup(); client.clear(); });
it('does not expose cached rows to the next account while its read is pending', async () => {
  const hook = renderHook(() => useComments('post'), { wrapper });
  await waitFor(() => expect(hook.result.current.data?.[0].text).toBe('Hello'));
  const oldKey = hook.result.current.queryKey;
  mock.read.mockReturnValue(new Promise(() => {}));
  act(() => { switchTo('bob'); hook.rerender(); });
  expect(hook.result.current.data).toBeUndefined(); expect(hook.result.current.queryKey).not.toEqual(oldKey);
});
it('drops a late read after switching away and back before any likes request', async () => {
  let finish!: (value: unknown) => void;
  mock.read.mockReturnValue(new Promise(() => {})).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const hook = renderHook(() => useComments('post'), { wrapper });
  await waitFor(() => expect(mock.read).toHaveBeenCalledTimes(1));
  const oldKey = hook.result.current.queryKey;
  act(() => { switchTo('bob'); switchTo('alice'); });
  await act(async () => finish({ data: [row], error: null }));
  await waitFor(() => expect(hook.result.current.queryKey).not.toEqual(oldKey));
  expect(hook.result.current.data).toBeUndefined(); expect(client.getQueryData(oldKey)).toBeUndefined();
  expect(mock.read.mock.calls.every(([table]) => table === 'comments')).toBe(true);
});
it('exposes likes failures and permits an explicit successful retry', async () => {
  mock.read.mockImplementation(table => table === 'comments' ? { data: [row], error: null } : { data: null, error: new Error('Unavailable') });
  const hook = renderHook(() => useComments('post'), { wrapper });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  mock.read.mockImplementation(table => ({ data: table === 'comments' ? [row] : [], error: null }));
  await act(async () => { await hook.result.current.refetch(); });
  await waitFor(() => expect(hook.result.current.data?.[0].like_count).toBe(0)); expect(hook.result.current.isError).toBe(false);
});
it.each(['signed-out','stale-profile','closed'])('does not request comments for %s', async mode => {
  if(mode === 'signed-out') switchTo('');
  if(mode === 'stale-profile') mock.owner = 'bob';
  renderHook(() => useComments(mode === 'closed' ? '' : 'post'), { wrapper });
  await act(async () => { await Promise.resolve(); }); expect(mock.read).not.toHaveBeenCalled();
});
