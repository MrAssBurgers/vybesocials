import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ uid: 'alice', auth: null as unknown as { currentUser: { uid: string } | null; onAuthStateChanged: (cb: (user: { uid: string } | null) => void) => () => void }, listener: null as null | ((user: { uid: string } | null) => void), invoke: vi.fn(), success: vi.fn(), info: vi.fn(), error: vi.fn(), sound: vi.fn(), haptic: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mock.uid ? { id: mock.uid } : null, profile: { id: `${mock.uid}-profile` } }) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => mock.auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: mock.invoke }));
vi.mock('@/lib/firebase', () => ({ db: { from: mock.from } }));
vi.mock('@/hooks/usePremiumStatus', () => ({ usePremiumStatus: () => ({ hasPremiumCosmetics: false }) }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: mock.haptic }));
vi.mock('@/lib/sounds', () => ({ playSound: mock.sound }));
vi.mock('sonner', () => ({ toast: { success: mock.success, info: mock.info, error: mock.error } }));
import { useTokenBalance, useEarnTokens } from './useVybeTokens';
import { useMarketplacePurchase } from './useMarketplacePurchase';
import { useActivateBoost } from './useActiveBoosts';
import { useEquipItem } from './useLockerItems';
function state(uid = mock.uid, quantity = 1) { return { wallet: { id: uid, user_id: uid, balance: 200, lifetime_earned: 200, lifetime_spent: 0, updated_at: '' }, transactions: [], inventory: [{ item_id: 'xp_boost_2x', quantity, kind: 'consumable', purchased_at: '' }], catalog: [], boosts: [], legacy_review: false, verified_total_xp: 0 }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function boost(expired = false) { const start = Date.now() - (expired ? 7200000 : 0); return { id: 'boost-one', boost_type: 'xp_2x', source_item_id: 'xp_boost_2x', activated_at: new Date(start).toISOString(), expires_at: new Date(start + 3600000).toISOString(), uses_remaining: null, consumed: false }; }
function switchTo(uid: string) { mock.uid = uid; mock.auth.currentUser = uid ? { uid } : null; mock.listener?.(mock.auth.currentUser); }
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
beforeEach(() => {
  vi.clearAllMocks(); mock.uid = 'alice'; mock.listener = null;
  mock.auth = { currentUser: { uid: 'alice' }, onAuthStateChanged: cb => { mock.listener = cb; return () => undefined; } };
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mock.from.mockImplementation(() => { throw new Error('Browser token write attempted'); });
  mock.invoke.mockResolvedValue({ data: state(), error: null });
});
afterEach(() => { cleanup(); client.clear(); });
describe('marketplace account and retry behavior', () => {
  it('never shows a previous account balance while the next wallet loads', async () => {
    const hook = renderHook(useTokenBalance, { wrapper });
    await waitFor(() => expect(hook.result.current.data?.balance).toBe(200));
    const pending = deferred<unknown>(); mock.invoke.mockReturnValue(pending.promise); switchTo('bob'); hook.rerender();
    expect(hook.result.current.data).toBeUndefined();
    await act(async () => pending.resolve({ data: state('bob'), error: null }));
    await waitFor(() => expect(hook.result.current.data?.user_id).toBe('bob'));
  });
  it('does not convert an unavailable wallet into a zero balance', async () => {
    mock.invoke.mockResolvedValue({ data: null, error: { name: 'not-found', message: 'Callable unavailable' } });
    const hook = renderHook(useTokenBalance, { wrapper });
    await waitFor(() => expect(hook.result.current.isError).toBe(true)); expect(hook.result.current.data).toBeUndefined();
  });
  it('retries a lost purchase response with one receipt, then uses a fresh receipt for a new consumable purchase', async () => {
    mock.invoke.mockResolvedValueOnce({ data: null, error: { name: 'unavailable', message: 'Response lost' } }).mockResolvedValue({ data: { success: true, item_id: 'xp_boost_2x', balance: 125 }, error: null });
    const hook = renderHook(useMarketplacePurchase, { wrapper }); const input = { itemId: 'xp_boost_2x', cost: 75, name: 'XP boost' };
    await act(async () => { await expect(hook.result.current.mutateAsync(input)).rejects.toThrow('Response lost'); });
    expect(mock.sound).not.toHaveBeenCalled();
    await act(async () => { await hook.result.current.mutateAsync(input); });
    expect(mock.invoke.mock.calls[0][1].requestId).toBe(mock.invoke.mock.calls[1][1].requestId);
    await act(async () => { await hook.result.current.mutateAsync(input); });
    expect(mock.invoke.mock.calls[2][1].requestId).not.toBe(mock.invoke.mock.calls[1][1].requestId);
    expect(mock.from).not.toHaveBeenCalled();
  });
  it('keeps activation receipts stable across a lost response', async () => {
    mock.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Lost' } }).mockResolvedValue({ data: { success: true, item_id: 'xp_boost_2x', boost: boost() }, error: null });
    const hook = renderHook(useActivateBoost, { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ itemId: 'xp_boost_2x', name: 'XP' })).rejects.toThrow(); });
    await act(async () => { await hook.result.current.mutateAsync({ itemId: 'xp_boost_2x', name: 'XP' }); });
    expect(mock.invoke.mock.calls[0][1].requestId).toBe(mock.invoke.mock.calls[1][1].requestId);
  });
  it('acknowledges an expired activation replay without claiming a new active boost', async () => {
    mock.invoke.mockResolvedValueOnce({ data: { success: true, item_id: 'xp_boost_2x', boost: boost(true) }, error: null }).mockResolvedValue({ data: { success: true, item_id: 'xp_boost_2x', boost: boost() }, error: null });
    const hook = renderHook(useActivateBoost, { wrapper }); const input = { itemId: 'xp_boost_2x', name: 'XP' };
    await act(async () => { await hook.result.current.mutateAsync(input); });
    expect(mock.info).toHaveBeenCalledWith(expect.stringContaining('activation has ended'));
    expect(mock.success).not.toHaveBeenCalled(); expect(mock.haptic).not.toHaveBeenCalled();
    await act(async () => { await hook.result.current.mutateAsync(input); });
    expect(mock.invoke.mock.calls[0][1].requestId).not.toBe(mock.invoke.mock.calls[1][1].requestId);
    expect(mock.success).toHaveBeenCalledWith('XP activated!');
  });
  it.each(['switch', 'aba', 'unmount'])('suppresses late purchase completion and caller callbacks on %s', async mode => {
    const pending = deferred<unknown>(); mock.invoke.mockReturnValue(pending.promise);
    const hook = renderHook(useMarketplacePurchase, { wrapper }); const callback = vi.fn(); let result!: Promise<unknown>;
    act(() => { result = hook.result.current.mutateAsync({ itemId: 'xp_boost_2x', cost: 75, name: 'XP' }, { onSuccess: callback }); });
    await waitFor(() => expect(mock.invoke).toHaveBeenCalledTimes(1));
    if (mode === 'unmount') hook.unmount(); else { switchTo('bob'); hook.rerender(); if (mode === 'aba') { switchTo('alice'); hook.rerender(); } }
    await act(async () => { pending.resolve({ data: { success: true, balance: 125, item_id: 'xp_boost_2x' }, error: null }); await expect(result).rejects.toMatchObject({ code: 'account-changed' }); });
    expect(callback).not.toHaveBeenCalled(); expect(mock.sound).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
  });
  it('rejects stale action functions before sending under a new account', async () => {
    const hook = renderHook(useMarketplacePurchase, { wrapper }); const stale = hook.result.current.mutateAsync;
    switchTo('bob'); hook.rerender();
    await act(async () => { await expect(stale({ itemId: 'xp', cost: 75, name: 'XP' })).rejects.toMatchObject({ code: 'account-changed' }); });
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it('rejects actions while React authentication is unbound even if native auth is signed in', async () => {
    mock.uid = '';
    const hook = renderHook(useMarketplacePurchase, { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ itemId: 'xp_boost_2x', cost: 75, name: 'XP' })).rejects.toMatchObject({ code: 'account-changed' }); });
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it('sends only the source ID for verified rewards', async () => {
    mock.invoke.mockResolvedValue({ data: { success: true, balance: 202, credited: 2 }, error: null });
    const hook = renderHook(useEarnTokens, { wrapper });
    await act(async () => { await hook.result.current.mutateAsync({ type: 'comment_added', referenceId: 'retained-comment-id' }); });
    expect(mock.invoke).toHaveBeenCalledWith('token-marketplace', { action: 'earn', type: 'comment_added', referenceId: 'retained-comment-id' });
  });
  it('routes paid equipment to the service and never marks a rejected equip successful', async () => {
    mock.invoke.mockResolvedValue({ data: null, error: { name: 'permission-denied', message: 'Item not owned' } });
    const hook = renderHook(useEquipItem, { wrapper }); const success = vi.fn();
    await act(async () => { await expect(hook.result.current.mutateAsync({ type: 'frame', value: 'avatar_frame_gold' }, { onSuccess: success })).rejects.toThrow('Item not owned'); });
    expect(success).not.toHaveBeenCalled(); expect(mock.from).not.toHaveBeenCalled();
  });
});
