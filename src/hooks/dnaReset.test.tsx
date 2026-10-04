import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ uid: 'alice', epoch: 0, read: vi.fn(), clear: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mock.uid ? { id: mock.uid } : null }) }));
vi.mock('@/lib/tokenMarketplaceService', () => ({ tokenAccountGuard: (uid: string) => {
  const epoch = mock.epoch;
  return () => { if (mock.uid !== uid || mock.epoch !== epoch) throw new Error('Account changed'); };
} }));
vi.mock('@/lib/dnaAdaptationService', () => ({ clearDnaAdaptationData: mock.clear, changeDnaAction: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: mock.success, error: mock.error }) }));
vi.mock('@/lib/firebase', () => ({ db: { from: (table: string) => {
  const chain: any = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, maybeSingle: () => chain,
    then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) => Promise.resolve(mock.read(table)).then(resolve, reject) };
  return chain;
} } }));
import { useDNAAutoPilot, normalizeDnaActions } from './useDNAAutoPilot';
let client: QueryClient;
const original = { id: 'old', user_id: 'alice', summary: 'Previous suggestion', action_type: 'theme_swap', applied: false, reverted: false, created_at: '2026-10-04' };
const read = (table: string) => ({ data: table === 'dna_agent_actions' ? [original] : { user_id: 'alice', mode: 'suggest' }, error: null });
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); mock.uid = 'alice'; mock.epoch++;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mock.read.mockImplementation(read); mock.clear.mockResolvedValue({ deleted: 1 });
});
afterEach(() => { cleanup(); client.clear(); });
it('removes cached history/preferences only after a confirmed reset', async () => {
  client.setQueryData(['dna-content-preferences', 'alice'], { boost_topics: ['art'] });
  const hook = renderHook(() => useDNAAutoPilot(), { wrapper });
  await waitFor(() => expect(hook.result.current.actions).toHaveLength(1));
  mock.read.mockImplementation(table => ({ data: table === 'dna_agent_actions' ? [] : { user_id: 'alice', mode: 'suggest' }, error: null }));
  await act(async () => { await hook.result.current.clearAdaptationData(); });
  expect(hook.result.current.actions).toEqual([]);
  expect(client.getQueryData(['dna-content-preferences', 'alice'])).toBeNull();
  expect(JSON.parse(localStorage.getItem('vybe-dna-actions-cache:alice')!)).toEqual([]);
  expect(mock.success).toHaveBeenCalledWith('Adaptation data cleared');
});
it('retains existing cached data and exposes reset errors', async () => {
  const hook = renderHook(() => useDNAAutoPilot(), { wrapper });
  await waitFor(() => expect(hook.result.current.actions).toHaveLength(1));
  mock.clear.mockRejectedValue(new Error('Service unavailable'));
  await act(async () => { await hook.result.current.clearAdaptationData(); });
  expect(hook.result.current.actions).toHaveLength(1);
  expect(mock.success).not.toHaveBeenCalled();
  expect(mock.error).toHaveBeenCalledWith('Service unavailable');
  expect(hook.result.current.clearing).toBe(false);
});
it('discards a late pre-reset history read and prevents duplicate dispatch', async () => {
  const hook = renderHook(() => useDNAAutoPilot(), { wrapper });
  await waitFor(() => expect(hook.result.current.actions).toHaveLength(1));
  let finishRead!: (value: unknown) => void;
  mock.read.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
  let refresh!: Promise<void>;
  act(() => { refresh = hook.result.current.refresh(); });
  await waitFor(() => expect(finishRead).toBeDefined());
  let finishClear!: () => void;
  mock.clear.mockImplementation(() => new Promise<void>(resolve => { finishClear = resolve; }));
  let clear!: Promise<void>;
  act(() => { clear = hook.result.current.clearAdaptationData(); });
  await act(async () => { await hook.result.current.clearAdaptationData(); });
  expect(mock.clear).toHaveBeenCalledTimes(1);
  mock.read.mockImplementation(table => ({ data: table === 'dna_agent_actions' ? [] : { user_id: 'alice', mode: 'suggest' }, error: null }));
  await act(async () => { finishClear(); await clear; });
  await act(async () => { finishRead({ data: { user_id: 'alice', mode: 'autonomous' }, error: null }); await refresh; });
  expect(hook.result.current.actions).toEqual([]);
  expect(hook.result.current.settings?.mode).toBe('suggest');
});
it('suppresses confirmation and cache changes after account switching away and back', async () => {
  const hook = renderHook(() => useDNAAutoPilot(), { wrapper });
  await waitFor(() => expect(hook.result.current.actions).toHaveLength(1));
  mock.clear.mockImplementation(async () => { mock.epoch += 2; return { deleted: 1 }; });
  await act(async () => { await hook.result.current.clearAdaptationData(); });
  expect(mock.success).not.toHaveBeenCalled(); expect(mock.error).not.toHaveBeenCalled();
  expect(hook.result.current.actions).toHaveLength(1);
  expect(hook.result.current.clearing).toBe(false);
  await act(async () => { await hook.result.current.clearAdaptationData(); });
  expect(mock.clear).toHaveBeenCalledTimes(2);
});
it('keeps prior data and exposes a retryable read failure instead of empty history', async () => {
  const hook = renderHook(() => useDNAAutoPilot(), { wrapper });
  await waitFor(() => expect(hook.result.current.actions).toHaveLength(1));
  mock.read.mockResolvedValue({ data: null, error: { message: 'permission-denied' } });
  await act(async () => { await hook.result.current.refresh(); });
  expect(hook.result.current.loadError).toMatch(/Could not load/);
  expect(hook.result.current.loading).toBe(false);
  expect(hook.result.current.actions).toHaveLength(1);
  mock.read.mockImplementation(read);
  await act(async () => { await hook.result.current.refresh(); });
  expect(hook.result.current.loadError).toBeNull();
});
it('rejects malformed cached actions and treats old status labels as unverified suggestions', () => {
  for (const value of [null, {}, 'bad', [null, {}, { ...original, action_type: null }], [{ ...original, user_id: 'bob' }]]) {
    expect(normalizeDnaActions(value, 'alice')).toEqual([]);
  }
  expect(normalizeDnaActions([{ ...original, applied: true, status: 'applied', before: { private: 'data' } }], 'alice')).toEqual([
    { ...original, before: null, after: null },
  ]);
});
