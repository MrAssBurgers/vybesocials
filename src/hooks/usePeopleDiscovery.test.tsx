import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, read: vi.fn() }));
vi.mock('./useProfileAccount', () => ({ useProfileAccount: () => {
  const { uid, epoch } = state;
  return { ready: !!uid, user: { id: uid }, profile: { id: `profile-${uid}`, user_id: uid, interests: ['music'] }, session: { uid, epoch },
    guard: () => { if (!uid || state.uid !== uid || state.epoch !== epoch) throw new Error('Account changed'); } };
} }));
vi.mock('@/lib/peopleDiscoveryService', () => ({ readPeopleDiscovery: state.read }));
import { usePeopleDiscovery } from './usePeopleDiscovery';
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
const result = () => ({ ageReviewRequired: false, validUntil: Date.now() + 15_000, profiles: [{ id: 'target', username: 'target', display_name: null, avatar_url: null, interests: ['music'], mutual_count: 1 }] });
const advance = async (ms = 25) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
beforeEach(() => {
  vi.useFakeTimers(); state.uid = 'alice'; state.epoch = 1; state.read.mockReset().mockImplementation(async (_actor, _selection, guard) => { guard(); return result(); });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  client = new QueryClient({ defaultOptions: { queries: { placeholderData: keepPreviousData, staleTime: Infinity, retry: true } } });
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); });
it('shares one checked read and preserves it when just one observer unmounts', async () => {
  const first = renderHook(usePeopleDiscovery, { wrapper }), second = renderHook(usePeopleDiscovery, { wrapper });
  await advance(); expect(state.read).toHaveBeenCalledOnce(); expect(first.result.current.data?.profiles[0].id).toBe('target');
  first.unmount(); await advance(); expect(second.result.current.data?.profiles[0].id).toBe('target');
  expect(state.read).toHaveBeenCalledWith({ uid: 'alice', profileId: 'profile-alice' }, { limit: 120 }, expect.any(Function));
});
it('masks an expired lease while a refresh is still pending', async () => {
  const hook = renderHook(usePeopleDiscovery, { wrapper }); await advance();
  state.read.mockImplementation(() => new Promise(() => {}));
  await advance(15_010); expect(hook.result.current.data).toBeUndefined(); expect(hook.result.current.isLoading).toBe(true);
});
it('renews a shortened lease early enough for a slow Firebase read', async () => {
  let calls = 0;
  state.read.mockImplementation(async (_actor, _selection, guard) => {
    if (++calls > 1) await new Promise(done => setTimeout(done, 5000));
    guard(); return { ...result(), validUntil: Date.now() + 9000 };
  });
  const hook = renderHook(usePeopleDiscovery, { wrapper }); await advance();
  const originalExpiry = hook.result.current.data!.validUntil;
  await advance(3400); expect(state.read).toHaveBeenCalledTimes(2);
  expect(hook.result.current.data?.profiles).toHaveLength(1);
  await advance(5000);
  expect(hook.result.current.data?.validUntil).toBeGreaterThan(originalExpiry);
  expect(hook.result.current.isLoading).toBe(false);
});
it('keeps failures actionable and never retains an old successful grant after rejection', async () => {
  const hook = renderHook(usePeopleDiscovery, { wrapper }); await advance();
  state.read.mockRejectedValueOnce(new Error('Connection failed'));
  act(() => hook.result.current.retry()); await advance();
  expect(hook.result.current.error?.message).toBe('Connection failed'); expect(hook.result.current.data).toBeUndefined(); expect(hook.result.current.isLoading).toBe(false);
  act(() => hook.result.current.retry()); await advance(); expect(hook.result.current.data?.profiles).toHaveLength(1);
});
it('retires pending old-account work across A to B to A', async () => {
  let resolve!: () => void;
  state.read.mockImplementationOnce(async (_actor, _selection, guard) => { await new Promise<void>(done => { resolve = done; }); guard(); return result(); });
  const hook = renderHook(usePeopleDiscovery, { wrapper }); await advance();
  state.uid = 'bob'; state.epoch++; hook.rerender(); await advance();
  state.uid = 'alice'; state.epoch++; hook.rerender(); await advance();
  act(() => resolve()); await advance(); expect(hook.result.current.data?.profiles[0].id).toBe('target');
  expect(client.getQueryData(['people-discovery', 'alice', 'profile-alice', 1, 0])).toBeUndefined();
});
it('removes grants during native pause and rereads on resume without needing visibility changes', async () => {
  const hook = renderHook(usePeopleDiscovery, { wrapper }); await advance();
  act(() => window.dispatchEvent(new Event('app-paused'))); await advance();
  expect(hook.result.current.data).toBeUndefined(); await advance(30_000); expect(state.read).toHaveBeenCalledOnce();
  act(() => window.dispatchEvent(new Event('app-resumed'))); await advance();
  expect(state.read).toHaveBeenCalledTimes(2); expect(hook.result.current.data?.profiles).toHaveLength(1);
});
it('does not turn the private birthday review requirement into empty suggestions', async () => {
  state.read.mockResolvedValue({ profiles: [], ageReviewRequired: true, validUntil: Date.now() + 15_000 });
  const hook = renderHook(usePeopleDiscovery, { wrapper }); await advance();
  expect(hook.result.current.data?.ageReviewRequired).toBe(true); expect(hook.result.current.isLoading).toBe(false);
});
