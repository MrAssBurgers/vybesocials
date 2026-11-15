import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  uid: 'alice', profileId: 'profile-alice' as string | undefined, epoch: 1,
  read: vi.fn(), dismissed: vi.fn(), upsert: vi.fn(), tables: [] as string[],
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: h.uid }, profile: { id: h.profileId } }) }));
vi.mock('./useAuthProfileId', () => ({ useAuthProfileId: () => h.profileId }));
vi.mock('./useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: h.uid, epoch: h.epoch }) }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountGuard: (expectedUid: string) => {
  const epoch = h.epoch;
  return () => { if (expectedUid !== h.uid || epoch !== h.epoch) throw Object.assign(new Error('Your account changed.'), { code: 'account-changed' }); };
} }));
vi.mock('@/lib/firebase', () => ({ db: { from: (table: string) => {
  h.tables.push(table);
  if (table === 'announcements') return { select: () => ({ eq: () => ({ order: h.read }) }) };
  if (table === 'dismissed_announcements') return { select: () => ({ eq: h.dismissed }), upsert: h.upsert };
  throw new Error('Unexpected table ' + table);
} } }));
import { useAnnouncements, useDismissAnnouncement } from './useAnnouncements';
const row = { id: 'welcome', title: 'Welcome', content: 'News', is_active: true, created_at: '2026-11-14T12:00:00Z' };
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
beforeEach(() => {
  h.uid = 'alice'; h.profileId = 'profile-alice'; h.epoch = 1; h.tables = [];
  h.read.mockReset().mockResolvedValue({ data: [row], error: null });
  h.dismissed.mockReset().mockResolvedValue({ data: [], error: null });
  h.upsert.mockReset().mockResolvedValue({ data: null, error: null });
});
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); });

it('stops a retired announcement read before it reads the previous account dismissals', async () => {
  let resolve!: (value: unknown) => void;
  h.read.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const { client, wrapper } = setup(); const hook = renderHook(() => useAnnouncements(), { wrapper });
  await waitFor(() => expect(h.read).toHaveBeenCalledOnce());
  const old = client.getQueryCache().getAll()[0];
  h.uid = 'bob'; h.profileId = undefined; h.epoch++; hook.rerender();
  await act(async () => { resolve({ data: [row], error: null }); });
  await waitFor(() => expect(old.state.fetchStatus).toBe('idle'));
  expect(h.dismissed).not.toHaveBeenCalled(); expect(old.state.data).toBeUndefined();
});

it('reports a failed dismissal-preference read instead of showing dismissed items as new', async () => {
  h.dismissed.mockResolvedValue({ data: null, error: { message: 'Unavailable', code: 'unavailable' } });
  const { wrapper } = setup(); const hook = renderHook(() => useAnnouncements(), { wrapper });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.data).toBeUndefined();
});

it.each(['another account', 'same-account reentry'])('rejects a retained dismissal callback after %s', async change => {
  const { wrapper } = setup(); const hook = renderHook(() => useDismissAnnouncement(), { wrapper });
  const retained = hook.result.current.mutateAsync;
  h.epoch++; if (change === 'another account') { h.uid = 'bob'; h.profileId = 'profile-bob'; } hook.rerender();
  await act(async () => { await expect(retained('welcome')).rejects.toMatchObject({ code: 'account-changed' }); });
  expect(h.upsert).not.toHaveBeenCalled();
});

it('rejects a retired dismissal acknowledgement without invalidating another account cache', async () => {
  let resolve!: (value: unknown) => void;
  h.upsert.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const { client, wrapper } = setup(), invalidate = vi.spyOn(client, 'invalidateQueries');
  const hook = renderHook(() => useDismissAnnouncement(), { wrapper });
  let outcome!: Promise<string | undefined>;
  act(() => { outcome = hook.result.current.mutateAsync('welcome').then(() => 'ack', error => error.code); });
  await waitFor(() => expect(h.upsert).toHaveBeenCalledOnce());
  h.uid = 'bob'; h.profileId = 'profile-bob'; h.epoch++; hook.rerender();
  await act(async () => { resolve({ data: null, error: null }); });
  expect(await outcome).toBe('account-changed'); expect(invalidate).not.toHaveBeenCalled();
});
