import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ uid: 'alice', profileOwner: null as string | null, auth: null as any, listener: null as any, invoke: vi.fn(), insert: vi.fn(), insertResult: null as unknown, rewardComment: vi.fn(), activity: vi.fn(), ad: vi.fn(), error: vi.fn(), streak: vi.fn(), moderate: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mock.uid ? { id: mock.uid } : null, profile: { id: `${mock.uid}-profile`, user_id: mock.profileOwner ?? mock.uid } }) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => mock.auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: mock.invoke }));
vi.mock('@/lib/firebase', () => ({ db: { from: () => ({ insert: (payload: unknown) => { mock.insert(payload); return { select: () => ({ single: () => mock.insertResult }) }; } }) } }));
vi.mock('./useVybeTokens', () => ({ useTokenReward: () => ({ rewardComment: mock.rewardComment }) }));
vi.mock('./useReactionStreaks', () => ({ useBumpReactionStreak: () => ({ mutate: mock.streak }) }));
vi.mock('@/lib/contentModeration', () => ({ filterBlockedContent: (text: string) => text, containsBlockedContent: () => ({ blocked: false }) }));
vi.mock('@/lib/nsfwScanner', () => ({ scanText: () => ({ result: 'allowed' }) }));
vi.mock('@/hooks/useModeration', () => ({ moderateContent: mock.moderate }));
vi.mock('@/lib/challengeProgressClient', () => ({ recordChallengeActivity: mock.activity }));
vi.mock('@/lib/despiaRewardedAds', () => ({ requestDespiaRewardedAd: mock.ad }));
vi.mock('sonner', () => ({ toast: { error: mock.error, info: vi.fn() } }));
vi.mock('@/lib/commentChanges', () => ({ changeComment: vi.fn(), saveCommentChange: async (payload: unknown) => {
  mock.insert(payload); const result = await mock.insertResult as { data: { id: string }; error?: Error };
  if (result.error) throw result.error;
  return { commentId: result.data.id };
} }));
import { useCreateComment } from './useComments';
import { useDailyLoginChallenge } from './useDailyLogin';
import { useRewardedAd } from './useRewardedAd';
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
function switchTo(uid: string) { mock.uid = uid; mock.auth.currentUser = { uid }; mock.listener?.(mock.auth.currentUser); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  vi.clearAllMocks(); mock.uid = 'alice'; mock.profileOwner = null; mock.listener = null;
  mock.auth = { currentUser: { uid: 'alice' }, onAuthStateChanged: (cb: unknown) => { mock.listener = cb; return () => undefined; } };
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mock.insertResult = Promise.resolve({ data: { id: 'saved-comment-id' }, error: null });
  mock.moderate.mockResolvedValue({ requires_review: false });
  mock.invoke.mockResolvedValue({ data: { success: true, credited: 3, balance: 3 }, error: null });
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); });
describe('verified reward source wiring', () => {
  it('passes the retained comment ID only after the comment has actually saved', async () => {
    const hook = renderHook(useCreateComment, { wrapper });
    await act(async () => { await hook.result.current.mutateAsync({ postId: 'post', text: 'Hello', authorId: 'alice-profile' }); });
    expect(mock.rewardComment).toHaveBeenCalledWith('saved-comment-id');
  });
  it('does not grant comment rewards for a failed save', async () => {
    mock.insertResult = Promise.resolve({ data: null, error: new Error('Denied') });
    const hook = renderHook(useCreateComment, { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ postId: 'post', text: 'Hello', authorId: 'alice-profile' })).rejects.toThrow(); });
    expect(mock.rewardComment).not.toHaveBeenCalled();
  });
  it('preserves a saved comment after account change without secondary effects or stale callbacks', async () => {
    const pending = deferred<unknown>(); mock.insertResult = pending.promise;
    const hook = renderHook(useCreateComment, { wrapper }); let result!: Promise<unknown>;
    const success = vi.fn();
    act(() => { result = hook.result.current.mutateAsync({ postId: 'post', text: 'Hello', authorId: 'author-profile' }, { onSuccess: success }); });
    await waitFor(() => expect(mock.insert).toHaveBeenCalled()); switchTo('bob'); hook.rerender();
    await act(async () => { pending.resolve({ data: { id: 'alice-comment' }, error: null }); await expect(result).resolves.toMatchObject({ id: 'alice-comment' }); });
    expect(mock.rewardComment).not.toHaveBeenCalled(); expect(mock.activity).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(mock.insert).toHaveBeenCalledTimes(1); expect(mock.moderate).not.toHaveBeenCalled(); expect(mock.streak).not.toHaveBeenCalled(); expect(mock.error).not.toHaveBeenCalled();
  });
  it.each(['missing-user', 'stale-profile'])('does not save a comment for an unbound context: %s', async mode => {
    if (mode === 'missing-user') mock.uid = ''; else mock.profileOwner = 'bob';
    const hook = renderHook(useCreateComment, { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ postId: 'post', text: 'Hello', authorId: 'author' })).rejects.toThrow('Not authenticated'); });
    expect(mock.insert).not.toHaveBeenCalled(); expect(mock.rewardComment).not.toHaveBeenCalled();
  });
  it('waits for a profile belonging to the current account before requesting login rewards', async () => {
    mock.profileOwner = 'bob';
    const hook = renderHook(useDailyLoginChallenge, { wrapper });
    await act(async () => { await Promise.resolve(); });
    expect(mock.invoke).not.toHaveBeenCalled();
    mock.profileOwner = 'alice'; hook.rerender();
    await waitFor(() => expect(mock.activity).toHaveBeenCalledWith('alice-profile', 'daily_login'));
  });
  it('requests daily login directly from the verified service without caller amount or old XP RPC', async () => {
    renderHook(useDailyLoginChallenge, { wrapper });
    await waitFor(() => expect(mock.invoke).toHaveBeenCalledWith('token-marketplace', { action: 'earn', type: 'daily_login' }));
    await waitFor(() => expect(mock.activity).toHaveBeenCalledWith('alice-profile', 'daily_login'));
  });
  it('tracks daily login separately for each account and drops old responses', async () => {
    const pending = deferred<unknown>(); mock.invoke.mockReturnValueOnce(pending.promise);
    const hook = renderHook(useDailyLoginChallenge, { wrapper });
    await waitFor(() => expect(mock.invoke).toHaveBeenCalledTimes(1)); switchTo('bob'); hook.rerender();
    await waitFor(() => expect(mock.activity).toHaveBeenCalledWith('bob-profile', 'daily_login'));
    await act(async () => pending.resolve({ data: { success: true, credited: 3, balance: 3 }, error: null }));
    expect(mock.activity).not.toHaveBeenCalledWith('alice-profile', 'daily_login');
  });
  it('keeps failed login rewards retryable instead of marking a local day complete', async () => {
    vi.useFakeTimers(); mock.invoke.mockResolvedValueOnce({ data: null, error: { name: 'unavailable', message: 'Unavailable' } });
    renderHook(useDailyLoginChallenge, { wrapper });
    await act(async () => { await Promise.resolve(); });
    expect(mock.activity).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(mock.invoke).toHaveBeenCalledTimes(2); expect(mock.activity).toHaveBeenCalledWith('alice-profile', 'daily_login');
  });
  it('never launches an ad or grants tokens from an unverified browser event', async () => {
    const hook = renderHook(useRewardedAd);
    expect(hook.result.current.canWatch).toBe(false);
    window.dispatchEvent(new Event('vybe-rewarded-ad-complete'));
    await act(async () => { await hook.result.current.watchAd(); });
    expect(mock.ad).not.toHaveBeenCalled(); expect(mock.invoke).not.toHaveBeenCalled();
  });
});
