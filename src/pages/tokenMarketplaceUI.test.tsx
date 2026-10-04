import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ uid: 'alice', shop: {} as Record<string, any>, wallet: {} as Record<string, any>, buy: vi.fn(), activate: vi.fn(), equip: vi.fn(), retry: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: mock.uid } }) }));
vi.mock('@/lib/tokenMarketplaceService', () => ({ tokenAccountSnapshot: () => ({ uid: mock.uid, epoch: 1 }) }));
vi.mock('@/lib/theme', () => ({ useTheme: () => ({ reducedMotion: true }) }));
vi.mock('@/hooks/useTokenMarketplace', () => ({ CATEGORY_LABELS: {}, useTokenMarketplace: () => mock.shop }));
vi.mock('@/hooks/useMarketplacePurchase', () => ({ useMarketplacePurchase: () => ({ mutate: mock.buy, isPending: false }) }));
vi.mock('@/hooks/useActiveBoosts', () => ({ useActivateBoost: () => ({ mutate: mock.activate, isPending: false }) }));
vi.mock('@/hooks/useLockerItems', () => ({ useEquipItem: () => ({ mutate: mock.equip, isPending: false }) }));
vi.mock('@/hooks/useVybeTokens', () => ({ useTokenBalance: () => mock.wallet, useTokenTransactions: () => ({ data: [], isLoading: false }), TOKEN_RATES: { daily_login: 3 }, TOKEN_DAILY_LIMITS: { daily_login: 1 } }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/ui/PageTransition', () => ({ PageTransition: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/tokens/ActiveBoostsBanner', () => ({ ActiveBoostsBanner: () => null }));
vi.mock('@/components/tokens/PurchaseSuccessModal', () => ({ PurchaseSuccessModal: ({ open, item }: { open: boolean; item?: { name: string } }) => open ? <p>Purchase confirmed: {item?.name}</p> : null }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
import TokenMarketplace from './TokenMarketplace';
import TokenWallet from './TokenWallet';
const xp = { id: 'xp_boost_2x', name: '2× XP Boost', description: 'Verified challenge XP doubled for one hour', perk: 'One hour', cost: 75, category: 'boost', icon: '⚡', kind: 'consumable', available: true };
beforeEach(() => {
  vi.clearAllMocks(); mock.uid = 'alice';
  mock.shop = { items: [xp], balance: 200, inventory: [], canAfford: () => true, ready: true, isLoading: false, isError: false, legacyReview: false, refetch: mock.retry };
  mock.wallet = { data: { balance: 200, lifetime_earned: 200, lifetime_spent: 0 }, isLoading: false, isError: false, legacyReview: false, refetch: mock.retry };
});
afterEach(cleanup);
describe('verified shop and wallet presentation', () => {
  it('does not show balance zero or purchase controls when the shop cannot load', () => {
    mock.shop.isError = true; mock.shop.ready = false; mock.shop.balance = undefined;
    render(<TokenMarketplace />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be verified');
    expect(screen.getByLabelText('Token balance')).toHaveTextContent('—');
    expect(screen.queryByRole('button', { name: /Buy 2×/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(mock.retry).toHaveBeenCalledOnce();
  });
  it('shows consumable quantity, consumes one through the API, and allows repurchase after depletion', () => {
    mock.shop.inventory = [{ item_id: xp.id, quantity: 1, kind: 'consumable' }];
    const view = render(<TokenMarketplace />);
    expect(screen.getByLabelText('2× XP Boost quantity')).toHaveTextContent('1 ready to use');
    fireEvent.click(screen.getByRole('button', { name: 'Activate 2× XP Boost' }));
    expect(mock.activate).toHaveBeenCalledWith({ itemId: xp.id, name: xp.name });
    mock.shop.inventory = [{ item_id: xp.id, quantity: 0, kind: 'consumable' }]; view.rerender(<TokenMarketplace />);
    expect(screen.queryByRole('button', { name: 'Activate 2× XP Boost' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Buy 2× XP Boost for 75 tokens' }));
    expect(mock.buy.mock.calls[0][0]).toEqual({ itemId: xp.id, name: xp.name, cost: 75 });
  });
  it('keeps unavailable benefits disabled and permanent ownership separate from consumable quantity', () => {
    mock.shop.items = [{ ...xp, available: false }, { ...xp, id: 'avatar_frame_gold', name: 'Gold frame', kind: 'permanent' }];
    mock.shop.inventory = [{ item_id: 'avatar_frame_gold', quantity: 1, kind: 'permanent' }];
    render(<TokenMarketplace />);
    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Owned · Equip' }));
    expect(mock.equip.mock.calls[0][0]).toEqual({ type: 'frame', value: 'avatar_frame_gold' });
    expect(mock.buy).not.toHaveBeenCalled();
  });
  it('shows purchase celebration only after confirmation and clears it on account change', () => {
    const view = render(<TokenMarketplace />); fireEvent.click(screen.getByRole('button', { name: /Buy 2× XP/ }));
    expect(screen.queryByText(/Purchase confirmed/)).not.toBeInTheDocument();
    act(() => mock.buy.mock.calls[0][1].onSuccess());
    expect(screen.getByText(/Purchase confirmed/)).toBeInTheDocument();
    mock.uid = 'bob'; view.rerender(<TokenMarketplace />);
    expect(screen.queryByText(/Purchase confirmed/)).not.toBeInTheDocument();
  });
  it('clearly retains historical review status without treating old records as spendable inventory', () => {
    mock.shop.legacyReview = true; mock.shop.balance = 0; mock.shop.canAfford = () => false;
    render(<TokenMarketplace />);
    expect(screen.getByRole('status')).toHaveTextContent('earlier token and purchase history is retained for review');
    expect(screen.getByRole('button', { name: /Buy 2× XP/ })).toBeDisabled();
  });
  it('wallet errors show unavailable history and retry, and ads have no launch control', () => {
    mock.wallet.isError = true; mock.wallet.data = undefined;
    render(<TokenWallet />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not verify');
    expect(screen.getByText('History unavailable. Please retry your wallet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
    expect(screen.queryByText('No transactions yet. Start earning tokens!')).not.toBeInTheDocument();
  });
});
