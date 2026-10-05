import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ uid: 'alice', epoch: 0, read: vi.fn(), clear: vi.fn(), change: vi.fn(), save: vi.fn(), run: vi.fn(), consume: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mock.uid ? { id: mock.uid } : null, profile: mock.uid ? { id: `${mock.uid}-profile`, user_id: mock.uid } : null }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: mock.uid, epoch: mock.epoch }) }));
vi.mock('@/lib/tokenMarketplaceService', () => ({ tokenAccountGuard: (uid: string) => {
  const epoch = mock.epoch; return () => { if (mock.uid !== uid || mock.epoch !== epoch) throw new Error('Account changed'); };
} }));
vi.mock('@/lib/dnaAdaptationService', () => ({ clearDnaAdaptationData: mock.clear, changeDnaAction: mock.change, readDnaState: mock.read, saveDnaSettings: mock.save, runDnaSuggestions: mock.run }));
vi.mock('@/lib/dnaSettingsConsumption', () => ({ consumeDnaSettings: mock.consume, guardDnaLocalTheme: () => () => {} }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: mock.success, error: mock.error }) }));
import { useDNAAutoPilot, normalizeDnaActions } from './useDNAAutoPilot';
let client: QueryClient;
const legacy = { id: 'old', user_id: 'alice', summary: 'Previous suggestion', action_type: 'theme_swap', applied: false, reverted: false, created_at: '2026-10-04' };
const action = { ...legacy, action_type: 'feed_tune', phase: 'suggested', generation: 'initial', change: { type: 'feed_tune', patch: { boost_topics: ['art'] } }, before: { kind: 'feed', preferences: null }, after: { kind: 'feed', preferences: { boost_topics: ['art'], reduce_topics: [] } } };
const state = (actions = [action]) => ({ settings: { user_id: mock.uid, mode: 'suggest' }, settingsVersion: 'v1', generation: 'initial', actions });
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); mock.uid = 'alice'; mock.epoch++;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mock.read.mockImplementation(() => Promise.resolve(state())); mock.clear.mockResolvedValue({ deleted: 1 }); mock.consume.mockResolvedValue(undefined);
  mock.change.mockImplementation((_uid, _id, apply) => Promise.resolve({ action: { ...action, phase: apply ? 'applied' : 'reverted', applied: apply, reverted: !apply }, target: action.after }));
});
afterEach(() => { cleanup(); client.clear(); });
it('purges legacy disk history and clears preferences only after confirmed reset', async () => {
  localStorage.setItem('vybe-dna-actions-cache:alice', JSON.stringify([legacy])); client.setQueryData(['dna-content-preferences', 'alice'], { boost_topics: ['art'] });
  const hook = renderHook(() => useDNAAutoPilot(), { wrapper }); await waitFor(() => expect(hook.result.current.actions).toHaveLength(1));
  expect(localStorage.getItem('vybe-dna-actions-cache:alice')).toBeNull(); mock.read.mockResolvedValue(state([]));
  await act(async () => { await hook.result.current.clearAdaptationData(); });
  expect(hook.result.current.actions).toEqual([]); expect(client.getQueryData(['dna-content-preferences', 'alice'])).toBeNull(); expect(mock.success).toHaveBeenCalledWith('Adaptation data cleared');
});
it('retains history and an actionable error after failed reset', async () => {
  const hook = renderHook(() => useDNAAutoPilot(), { wrapper }); await waitFor(() => expect(hook.result.current.actions).toHaveLength(1));
  mock.clear.mockRejectedValue(new Error('Service unavailable')); await act(async () => { await hook.result.current.clearAdaptationData(); });
  expect(hook.result.current.actions).toHaveLength(1); expect(mock.success).not.toHaveBeenCalled(); expect(hook.result.current.operationError).toBe('Service unavailable'); expect(hook.result.current.clearing).toBe(false);
});
it('discards a late pre-reset read and prevents duplicate dispatch', async () => {
  const hook = renderHook(() => useDNAAutoPilot(), { wrapper }); await waitFor(() => expect(hook.result.current.actions).toHaveLength(1));
  let finishRead!: (value: unknown) => void; mock.read.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
  let refresh!: Promise<void>; act(() => { refresh = hook.result.current.refresh(); });
  let finishClear!: () => void; mock.clear.mockImplementation(() => new Promise<void>(resolve => { finishClear = resolve; }));
  let clear!: Promise<void>; act(() => { clear = hook.result.current.clearAdaptationData(); }); await act(async () => { await hook.result.current.clearAdaptationData(); }); expect(mock.clear).toHaveBeenCalledTimes(1);
  mock.read.mockResolvedValue(state([])); await act(async () => { finishClear(); await clear; });
  await act(async () => { finishRead(state()); await refresh; }); expect(hook.result.current.actions).toEqual([]);
});
it('suppresses reset confirmation after switching away and back, then releases the busy state', async () => {
  const hook = renderHook(() => useDNAAutoPilot(), { wrapper }); await waitFor(() => expect(hook.result.current.actions).toHaveLength(1));
  mock.clear.mockImplementation(async () => { mock.epoch += 2; return { deleted: 1 }; });
  await act(async () => { await hook.result.current.clearAdaptationData(); }); expect(mock.success).not.toHaveBeenCalled(); expect(mock.error).not.toHaveBeenCalled(); expect(hook.result.current.clearing).toBe(false);
});
it('preserves load errors for retry rather than showing empty history', async () => {
  const hook = renderHook(() => useDNAAutoPilot(), { wrapper }); await waitFor(() => expect(hook.result.current.actions).toHaveLength(1));
  mock.read.mockRejectedValue(new Error('Permission check unavailable')); await act(async () => { await hook.result.current.refresh(); });
  expect(hook.result.current.loadError).toBe('Permission check unavailable'); expect(hook.result.current.actions).toHaveLength(1);
  mock.read.mockResolvedValue(state()); await act(async () => { await hook.result.current.refresh(); }); expect(hook.result.current.loadError).toBeNull();
});
it('consumes checked settings before claiming Apply and suppresses duplicate Apply clicks', async () => {
  const hook = renderHook(() => useDNAAutoPilot(), { wrapper }); await waitFor(() => expect(hook.result.current.actions).toHaveLength(1));
  let finish!: (value: unknown) => void; mock.change.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let pending!: Promise<void>; act(() => { pending = hook.result.current.applyPending('old'); }); await act(async () => { await hook.result.current.applyPending('old'); });
  expect(mock.change).toHaveBeenCalledTimes(1); expect(mock.success).not.toHaveBeenCalled();
  mock.consume.mockImplementation(async () => { expect(mock.success).not.toHaveBeenCalled(); });
  await act(async () => { finish({ action: { ...action, phase: 'applied', applied: true }, target: action.after }); await pending; });
  expect(mock.consume).toHaveBeenCalledTimes(1); expect(mock.success).toHaveBeenCalledWith('Applied');
});
it('does not claim Apply when visible settings fail to consume a server receipt', async () => {
  const hook = renderHook(() => useDNAAutoPilot(), { wrapper }); await waitFor(() => expect(hook.result.current.actions).toHaveLength(1));
  mock.consume.mockRejectedValue(new Error('Device storage unavailable')); await act(async () => { await hook.result.current.applyPending('old'); });
  expect(mock.success).not.toHaveBeenCalled(); expect(hook.result.current.operationError).toBe('Device storage unavailable'); expect(hook.result.current.actions[0].phase).toBe('suggested');
});
it('a reset event during Apply retires the receipt before settings or labels change', async () => {
  const hook = renderHook(() => useDNAAutoPilot(), { wrapper }); await waitFor(() => expect(hook.result.current.actions).toHaveLength(1));
  mock.change.mockImplementation(async () => { mock.read.mockResolvedValue(state([])); window.dispatchEvent(new CustomEvent('vybeDnaAdaptationCleared', { detail: 'alice' })); return { action: { ...action, phase: 'applied' }, target: action.after }; });
  await act(async () => { await hook.result.current.applyPending('old'); });
  expect(mock.consume).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled(); expect(hook.result.current.actions).toEqual([]);
});
it('account changes during Apply cannot alter another account caches or claim success', async () => {
  const hook = renderHook(() => useDNAAutoPilot(), { wrapper }); await waitFor(() => expect(hook.result.current.actions).toHaveLength(1));
  mock.change.mockImplementation(async () => { mock.epoch += 2; return { action: { ...action, phase: 'applied' }, target: action.after }; });
  await act(async () => { await hook.result.current.applyPending('old'); }); expect(mock.consume).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
});
it('rejects malformed cache and treats old status labels as unverified suggestions', () => {
  for (const value of [null, {}, 'bad', [null, {}, { ...legacy, action_type: null }], [{ ...legacy, user_id: 'bob' }]]) expect(normalizeDnaActions(value, 'alice')).toEqual([]);
  expect(normalizeDnaActions([{ ...legacy, applied: true, status: 'applied', before: { private: 'data' } }], 'alice')).toEqual([{ ...legacy, before: null, after: null }]);
});
