import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
const state = vi.hoisted(() => ({ uid: 'alice' as string | null, status: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.uid ? { id: state.uid } : null }) }));
vi.mock('./useRevenueCat', () => ({ useRevenueCat: () => ({ isEntitled: () => false, isLoading: false, customerInfo: null }) }));
vi.mock('@/lib/premiumGiftService', () => ({ verifiedPremiumStatus: state.status }));
import { usePremiumStatus } from './usePremiumStatus';
const ordinary = { active: false, gift_active: false, is_owner: false, can_manage_gifts: false, expires_at: null as string | null };
function fixture() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return renderHook(usePremiumStatus, { wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }); }
beforeEach(() => { vi.clearAllMocks(); state.uid = 'alice'; state.status.mockResolvedValue(ordinary); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('premium cosmetics and free-feature policy', () => {
  it('keeps core features free when premium verification is unavailable', async () => { state.status.mockRejectedValue(new Error('Unavailable')); const { result } = fixture(); await waitFor(() => expect(result.current.isLoading).toBe(false)); expect(result.current.isPremium).toBe(true); expect(result.current.hasPremiumCosmetics).toBe(false); });
  it('keeps core features free without signing in and performs no account query', () => { state.uid = null; const { result } = fixture(); expect(result.current.isPremium).toBe(true); expect(result.current.hasPremiumCosmetics).toBe(false); expect(state.status).not.toHaveBeenCalled(); });
  it('enables cosmetics for a server-confirmed gift', async () => { state.status.mockResolvedValue({ ...ordinary, active: true, gift_active: true }); const { result } = fixture(); await waitFor(() => expect(result.current.isGifted).toBe(true)); expect(result.current.hasPremiumCosmetics).toBe(true); });
  it('keeps owner preview separate from gift management authority', async () => { state.status.mockResolvedValue({ ...ordinary, is_owner: true }); const { result } = fixture(); await waitFor(() => expect(result.current.isOwner).toBe(true)); expect(result.current.canManageGifts).toBe(false); });
  it('expires a displayed gift on time without waiting for focus', async () => {
    vi.useFakeTimers();
    state.status.mockResolvedValueOnce({ ...ordinary, active: true, gift_active: true, expires_at: new Date(Date.now() + 1000).toISOString() }).mockResolvedValue(ordinary);
    const { result } = fixture(); await act(async () => { await vi.advanceTimersByTimeAsync(5); }); expect(result.current.isGifted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); }); expect(result.current.isGifted).toBe(false); expect(result.current.hasPremiumCosmetics).toBe(false); expect(state.status).toHaveBeenCalledTimes(2);
  });
  it('does not carry a delayed owner result into the next account', async () => {
    let finish!: (value: typeof ordinary) => void;
    state.status.mockImplementation((uid: string) => uid === 'alice' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(ordinary));
    const { result, rerender } = fixture(); await waitFor(() => expect(state.status).toHaveBeenCalledWith('alice'));
    state.uid = 'bob'; rerender(); await waitFor(() => expect(state.status).toHaveBeenCalledWith('bob'));
    await act(async () => finish({ ...ordinary, is_owner: true })); await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isOwner).toBe(false); expect(result.current.hasPremiumCosmetics).toBe(false); expect(result.current.isPremium).toBe(true);
  });
});
