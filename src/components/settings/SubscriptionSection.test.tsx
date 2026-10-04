import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const state = vi.hoisted(() => ({ uid: 'alice', pending: null as any, error: null as any, accept: vi.fn(), retry: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid } }) }));
vi.mock('@/hooks/usePremiumStatus', () => ({ usePremiumStatus: () => ({ isOwner: false, isGifted: false, customerInfo: null }) }));
vi.mock('@/hooks/usePendingPremiumGift', () => ({ usePendingPremiumGift: () => ({ data: state.pending, error: state.error, refetch: state.retry }) }));
vi.mock('@/lib/premiumGiftService', () => ({ acceptPremiumGift: state.accept, isPremiumAccountCurrent: (uid: string) => uid === state.uid }));
vi.mock('sonner', () => ({ toast: { error: state.toast } }));
vi.mock('@/components/premium/CustomerCenter', () => ({ CustomerCenter: () => null }));
import { SubscriptionSection } from './SubscriptionSection';
function fixture() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); const view = () => <QueryClientProvider client={client}><SubscriptionSection /></QueryClientProvider>; return { ...render(view()), view, client }; }
beforeEach(() => { vi.clearAllMocks(); state.uid = 'alice'; state.pending = { id: 'gift-1', user_id: 'alice', gifterUsername: 'team', expires_at: null }; state.error = null; state.accept.mockResolvedValue(undefined); });
afterEach(cleanup);
describe('voluntary gift review in Settings', () => {
  it('keeps functional features free and does not open an automatic popup', () => {
    fixture(); expect(screen.getByText('Everything is free right now')).toBeTruthy(); expect(screen.getByRole('button', { name: 'Review gift' })).toBeTruthy(); expect(screen.queryByRole('dialog')).toBeNull(); expect(state.accept).not.toHaveBeenCalled();
  });
  it('shows success only after a confirmed acceptance and can close it', async () => {
    let finish!: () => void; state.accept.mockReturnValue(new Promise<void>(resolve => { finish = resolve; })); fixture();
    fireEvent.click(screen.getByRole('button', { name: 'Review gift' })); fireEvent.click(screen.getByRole('button', { name: 'Accept gift' }));
    expect(screen.queryByText('Gift accepted')).toBeNull(); expect(screen.getByRole('button', { name: 'Accept gift' }).hasAttribute('disabled')).toBe(true);
    await act(async () => finish()); expect(screen.getByText('Gift accepted')).toBeTruthy(); expect(state.accept).toHaveBeenCalledWith('alice', 'gift-1');
    fireEvent.click(screen.getByRole('button', { name: 'Done' })); expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('keeps failed acceptance retryable and never displays success', async () => {
    state.accept.mockRejectedValue(new Error('Gift was revoked')); fixture(); fireEvent.click(screen.getByRole('button', { name: 'Review gift' })); fireEvent.click(screen.getByRole('button', { name: 'Accept gift' }));
    await waitFor(() => expect(state.toast).toHaveBeenCalledWith('Gift was revoked')); expect(screen.queryByText('Gift accepted')).toBeNull(); expect(screen.getByRole('button', { name: 'Accept gift' }).hasAttribute('disabled')).toBe(false);
  });
  it('discards an old-account pending acceptance when the account changes', async () => {
    let finish!: () => void; state.accept.mockReturnValue(new Promise<void>(resolve => { finish = resolve; })); const rendered = fixture();
    fireEvent.click(screen.getByRole('button', { name: 'Review gift' })); fireEvent.click(screen.getByRole('button', { name: 'Accept gift' }));
    state.uid = 'bob'; state.pending = null; rendered.rerender(rendered.view()); await act(async () => finish());
    expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.queryByText('Gift accepted')).toBeNull(); expect(state.toast).not.toHaveBeenCalled();
  });
  it('distinguishes unavailable gift checks from having no gift', () => { state.error = new Error('Missing service'); state.pending = null; fixture(); expect(screen.getByRole('alert').textContent).toContain('temporarily unavailable'); fireEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(state.retry).toHaveBeenCalled(); });
});
