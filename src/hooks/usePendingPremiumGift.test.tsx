import type { PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, read: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid } }) }));
vi.mock('./useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: state.uid, epoch: state.epoch }) }));
vi.mock('@/lib/premiumGiftService', () => ({ pendingPremiumGift: state.read }));
import { usePendingPremiumGift } from './usePendingPremiumGift';
const gift = { id: 'old-gift', user_id: 'alice', gifterUsername: 'team', expires_at: null };
function fixture() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; return { client, ...renderHook(usePendingPremiumGift, { wrapper }) }; }
beforeEach(() => { state.uid = 'alice'; state.epoch = 1; state.read.mockReset(); });
afterEach(cleanup);
it('does not reuse a cached gift from an earlier session of the same account', async () => {
  state.read.mockResolvedValueOnce(gift).mockResolvedValue(null);
  const view = fixture(); await waitFor(() => expect(view.result.current.data).toEqual(gift));
  state.epoch += 2; view.rerender(); expect(view.result.current.data).toBeUndefined();
  await waitFor(() => expect(view.result.current.data).toBeNull()); expect(state.read).toHaveBeenCalledTimes(2); view.client.clear();
});
it('keeps a late old-session gift out of the replacement query', async () => {
  let finish!: (value: typeof gift) => void;
  state.read.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue(null);
  const view = fixture(); await waitFor(() => expect(state.read).toHaveBeenCalledOnce());
  state.epoch += 2; view.rerender(); await waitFor(() => expect(view.result.current.data).toBeNull());
  await act(async () => finish(gift)); expect(view.result.current.data).toBeNull(); view.client.clear();
});
