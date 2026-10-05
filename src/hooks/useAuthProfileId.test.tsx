import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { keepPreviousData, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const state = vi.hoisted(() => ({ user: { id: 'alice' }, profile: null as null | { id: string; user_id: string }, session: { uid: 'alice', epoch: 1 }, resolve: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.user, profile: state.profile }) }));
vi.mock('./useReportAccountSession', () => ({ useReportAccountSession: () => state.session }));
vi.mock('@/lib/resolveSessionProfileId', () => ({ syncSessionProfileId: () => undefined, resolveSessionProfileId: () => state.resolve() }));
import { useAuthProfileId } from './useAuthProfileId';
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { placeholderData: keepPreviousData, retry: false } } }); clients.push(client);
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
beforeEach(() => { vi.resetAllMocks(); state.user = { id: 'alice' }; state.profile = null; state.session = { uid: 'alice', epoch: 1 }; });
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients.length = 0; });
describe('profile ID consumers with production previous-data defaults', () => {
  it('does not reuse Alice identity while Bob resolves or when Alice returns in a new epoch', async () => {
    state.resolve.mockResolvedValueOnce('profile-alice');
    const { wrapper } = setup(); const view = renderHook(useAuthProfileId, { wrapper });
    await waitFor(() => expect(view.result.current).toBe('profile-alice'));
    let completeBob!: (id: string) => void;
    state.resolve.mockReturnValueOnce(new Promise<string>(r => { completeBob = r; }));
    state.user = { id: 'bob' }; state.session = { uid: 'bob', epoch: 2 }; view.rerender();
    expect(view.result.current).toBeUndefined();
    state.resolve.mockReturnValueOnce(new Promise(() => {}));
    state.user = { id: 'alice' }; state.session = { uid: 'alice', epoch: 3 }; view.rerender();
    expect(view.result.current).toBeUndefined();
    await act(async () => completeBob('profile-bob')); expect(view.result.current).toBeUndefined();
  });
  it('rejects a stale auth context or foreign profile during SDK account hydration', () => {
    const { wrapper } = setup(); state.profile = { id: 'profile-alice', user_id: 'alice' }; state.session = { uid: 'bob', epoch: 2 };
    const view = renderHook(useAuthProfileId, { wrapper });
    expect(view.result.current).toBeUndefined(); expect(state.resolve).not.toHaveBeenCalled();
    state.user = { id: 'bob' }; state.resolve.mockReturnValue(new Promise(() => {})); view.rerender();
    expect(view.result.current).toBeUndefined();
  });
  it('prefers the current owned live profile over an earlier lookup and ignores legacy cache strings', async () => {
    const { client, wrapper } = setup(); client.setQueryData(['session-profile-id', 'alice', 1], 'profile-foreign');
    state.resolve.mockResolvedValue('profile-alice');
    const view = renderHook(useAuthProfileId, { wrapper }); expect(view.result.current).toBeUndefined();
    await waitFor(() => expect(view.result.current).toBe('profile-alice'));
    state.profile = { id: 'canonical-alice', user_id: 'alice' }; view.rerender(); expect(view.result.current).toBe('canonical-alice');
  });
});
