import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';

const state = vi.hoisted(() => ({ uid: 'staff-a' as string | undefined, epoch: 1, ready: true, read: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.uid ? { id: state.uid } : null, authReady: state.ready }) }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => 'cached-profile' }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: state.uid, epoch: state.epoch }) }));
vi.mock('@/lib/reportModerationService', () => ({
  reportAccountGuard: (uid: string) => { const epoch = state.epoch; return () => {
    if (!uid || uid !== state.uid || epoch !== state.epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' });
  }; },
  getPendingReportCount: vi.fn(), getReportPage: vi.fn(), performReportAction: vi.fn(),
}));
vi.mock('@/lib/firebase', () => ({ db: { from: () => ({ select: () => ({ order: state.read }) }) } }));
vi.mock('@/lib/edgeFeature', () => ({ invokeEdgeFeature: vi.fn() }));
vi.mock('@/lib/previewSandbox', () => ({ isFounderAuthId: () => false, isPreviewFounderUser: () => false }));
import { useContentFlags } from './useModeration';

const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }); clients.push(client);
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(() => useContentFlags(), { wrapper }) };
}
beforeEach(() => { state.uid = 'staff-a'; state.epoch = 1; state.ready = true; state.read.mockReset(); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe('legacy flags account boundary', () => {
  it.each([false, true])('drops late previous-session rows after an account change (returned=%s)', async returned => {
    let resolve!: (value: unknown) => void;
    state.read.mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValue({ data: [], error: null });
    const page = mount();
    await waitFor(() => expect(state.read).toHaveBeenCalledOnce());
    state.uid = 'staff-b'; state.epoch++; page.rerender();
    await waitFor(() => expect(page.result.current.data).toEqual([]));
    if (returned) { state.uid = 'staff-a'; state.epoch++; page.rerender(); await waitFor(() => expect(page.result.current.data).toEqual([])); }
    await act(async () => { resolve({ data: [{ id: 'private-old', flagged_text: 'Private previous session' }], error: null }); });
    expect(page.result.current.data).toEqual([]);
    expect(page.client.getQueryData(['content-flags', 'staff-a', 1])).toBeUndefined();
  });
  it('does not reuse the old unscoped cache or another account cache', async () => {
    state.read.mockResolvedValueOnce({ data: [{ id: 'a' }], error: null }).mockResolvedValue({ data: [{ id: 'b' }], error: null });
    const page = mount();
    page.client.setQueryData(['content-flags'], [{ id: 'legacy-secret' }]);
    await waitFor(() => expect(page.result.current.data).toEqual([{ id: 'a' }]));
    state.uid = 'staff-b'; state.epoch++; page.rerender();
    expect(page.result.current.data).toBeUndefined();
    await waitFor(() => expect(page.result.current.data).toEqual([{ id: 'b' }]));
  });
  it('keeps failed reads as errors and allows a confirmed retry', async () => {
    state.read.mockResolvedValueOnce({ data: null, error: new Error('Permission denied') }).mockResolvedValue({ data: [], error: null });
    const page = mount();
    await waitFor(() => expect(page.result.current.isError).toBe(true));
    expect(page.result.current.data).toBeUndefined();
    await act(async () => { await page.result.current.refetch(); });
    await waitFor(() => expect(page.result.current.isSuccess).toBe(true)); expect(page.result.current.data).toEqual([]);
  });
  it('does not read while signed out even with a cached profile', async () => {
    state.uid = undefined;
    const page = mount();
    expect(page.result.current.fetchStatus).toBe('idle'); expect(state.read).not.toHaveBeenCalled();
  });
});
