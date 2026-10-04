import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ uid: 'alice', owner: 'alice', auth: null as any, listener: null as any, change: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: mock.uid }, profile: { id: 'alice-profile', user_id: mock.owner } }) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => mock.auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/commentChanges', () => ({ changeComment: mock.change }));
vi.mock('./useVybeTokens', () => ({ useTokenReward: vi.fn() }));
vi.mock('./useReactionStreaks', () => ({ useBumpReactionStreak: vi.fn() }));
vi.mock('@/lib/contentModeration', () => ({ filterBlockedContent: (text: string) => text, containsBlockedContent: () => ({ blocked: false }) }));
vi.mock('@/lib/nsfwScanner', () => ({ scanText: vi.fn() }));
vi.mock('@/hooks/useModeration', () => ({ moderateContent: vi.fn() }));
vi.mock('@/lib/challengeProgressClient', () => ({ recordChallengeActivity: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: mock.error, success: mock.success } }));
import { useDeleteComment, useEditComment } from './useComments';
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
function switchTo(uid: string) { mock.uid = uid; mock.owner = uid; mock.auth.currentUser = { uid }; mock.listener?.(mock.auth.currentUser); }
beforeEach(() => {
  vi.clearAllMocks(); mock.uid = mock.owner = 'alice'; mock.listener = null;
  mock.auth = { currentUser: { uid: 'alice' }, onAuthStateChanged: (cb: unknown) => { mock.listener = cb; return () => {}; } };
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  mock.change.mockImplementation(async (input, _profile, guard) => ({ postId: input.postId, guard }));
});
afterEach(() => { cleanup(); client.clear(); });
it.each([useDeleteComment, useEditComment])('suppresses late success and caller callbacks after an away-and-back switch', async hookFn => {
  let finish!: () => void;
  mock.change.mockImplementation((input, _profile, guard) => new Promise(resolve => { finish = () => resolve({ postId: input.postId, guard }); }));
  const hook = renderHook(hookFn, { wrapper }); const success = vi.fn(); const settled = vi.fn();
  let pending!: Promise<unknown>;
  act(() => { pending = hook.result.current.mutateAsync({ commentId: 'comment', postId: 'post', text: 'Edited' }, { onSuccess: success, onSettled: settled }); });
  await waitFor(() => expect(mock.change).toHaveBeenCalledTimes(1)); switchTo('bob'); switchTo('alice'); hook.rerender();
  await act(async () => { finish(); await pending; });
  expect(mock.success).not.toHaveBeenCalled(); expect(success).not.toHaveBeenCalled(); expect(settled).not.toHaveBeenCalled();
});
it('rejects a stale profile before changing anything', async () => {
  mock.owner = 'bob'; const hook = renderHook(useDeleteComment, { wrapper });
  await act(async () => { await expect(hook.result.current.mutateAsync({ commentId: 'comment', postId: 'post' })).rejects.toThrow('Not authenticated'); });
  expect(mock.change).not.toHaveBeenCalled();
});
it('reports a failed edit without calling success so the composer keeps its text', async () => {
  mock.change.mockRejectedValue(new Error('This comment is no longer available.')); const hook = renderHook(useEditComment, { wrapper }); const success = vi.fn();
  await act(async () => { await expect(hook.result.current.mutateAsync({ commentId: 'comment', postId: 'post', text: 'Retry me' }, { onSuccess: success })).rejects.toThrow('no longer available'); });
  expect(success).not.toHaveBeenCalled(); expect(mock.error).toHaveBeenCalledWith('This comment is no longer available.');
});
