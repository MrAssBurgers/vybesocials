import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: { uid: 'alice', epoch: 1 }, read: vi.fn() }));
vi.mock('@/hooks/useStoryAccount', () => ({ useStoryAccount: () => {
  const epoch = state.session.epoch;
  return { profile: { id: `p-${state.session.uid}` }, session: state.session, ready: true,
    guard: () => { if (epoch !== state.session.epoch) throw new Error('Account changed'); } };
} }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ getDocumentsFromServer: state.read, where: (...args: unknown[]) => args, orderBy: (...args: unknown[]) => args, firestoreLimit: (value: number) => value }));
import { useStoryHighlights } from './useStoryHighlights';
const secret = { id: 'highlight', owner_id: 'p-alice', title: 'Private highlight', cover_url: 'https://example.invalid/private.jpg' };
function fixture() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }; }
beforeEach(() => { vi.clearAllMocks(); state.session = { uid: 'alice', epoch: 1 }; state.read.mockResolvedValue([secret]); });
afterEach(cleanup);
describe('temporary owner-only legacy highlights', () => {
  it('never requests or reveals another profile’s cover, even from a pre-existing cache', () => {
    const { wrapper, client } = fixture(); client.setQueryData(['story-highlights', 'p-bob', 'alice', 1], [{ ...secret, owner_id: 'p-bob' }]);
    const { result } = renderHook(() => useStoryHighlights('p-bob'), { wrapper }); expect(state.read).not.toHaveBeenCalled(); expect(result.current.data).toBeUndefined();
  });
  it('reads only owned highlights from the server and masks a failed recheck', async () => {
    const { wrapper } = fixture(); const { result } = renderHook(() => useStoryHighlights('p-alice'), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([secret]));
    expect(state.read).toHaveBeenCalledWith('story_highlights', [['owner_id', '==', 'p-alice'], ['updated_at', 'desc'], 30]);
    state.read.mockRejectedValue(new Error('Denied')); await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.data).toBeUndefined();
  });
  it('rejects a pending old account’s private cover before populating a later epoch', async () => {
    let resolve!: (value: typeof secret[]) => void; state.read.mockReturnValue(new Promise(yes => { resolve = yes; }));
    const { wrapper, client } = fixture(); const { result, rerender } = renderHook(() => useStoryHighlights('p-alice'), { wrapper });
    await waitFor(() => expect(state.read).toHaveBeenCalledOnce()); state.session = { uid: 'bob', epoch: 2 }; rerender();
    await act(async () => { resolve([secret]); }); expect(result.current.data).toBeUndefined();
    expect(JSON.stringify(client.getQueryCache().getAll().map(row => row.state.data))).not.toContain('private.jpg');
  });
});
