import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ auth: null as unknown as { currentUser: { uid: string } | null; onAuthStateChanged: (cb: (user: { uid: string } | null) => void) => () => void }, listener: null as null | ((user: { uid: string } | null) => void), invoke: vi.fn() }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => mock.auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: mock.invoke }));
import { tokenAccountGuard, tokenMarketplaceRequest, validateTokenState, tokenAttempt } from './tokenMarketplaceService';
import { rpcEarnVybeTokens, rpcPurchaseMarketplaceItem } from './firebase/tokenRpc';

function state() { return { wallet: { id: 'alice', user_id: 'alice', balance: 100, lifetime_earned: 100, lifetime_spent: 0, updated_at: '' }, transactions: [], inventory: [], boosts: [], catalog: [], legacy_review: false, verified_total_xp: 0 }; }
function switchTo(uid: string | null) { mock.auth.currentUser = uid ? { uid } : null; mock.listener?.(mock.auth.currentUser); }
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); mock.listener = null;
  mock.auth = { currentUser: { uid: 'alice' }, onAuthStateChanged: cb => { mock.listener = cb; return () => undefined; } };
  mock.invoke.mockResolvedValue({ data: state(), error: null });
});
describe('trusted token API', () => {
  it('reads the canonical wallet only through the callable', async () => {
    await expect(tokenMarketplaceRequest({ action: 'state' })).resolves.toMatchObject({ wallet: { balance: 100, user_id: 'alice' } });
    expect(mock.invoke).toHaveBeenCalledWith('token-marketplace', { action: 'state' });
  });
  it.each([null, {}, { ...state(), wallet: { ...state().wallet, balance: '100' } }, { ...state(), wallet: { ...state().wallet, user_id: 'bob' } }, { ...state(), wallet: { ...state().wallet, balance: -1 } }])('rejects unavailable or malformed balances instead of inventing zero', data => {
    expect(() => validateTokenState(data, 'alice')).toThrow();
  });
  it('preserves retained-history status without importing a legacy balance', () => {
    expect(validateTokenState({ ...state(), legacy_review: true, wallet: { ...state().wallet, balance: 0 } }, 'alice')).toMatchObject({ legacy_review: true, wallet: { balance: 0 } });
  });
  it.each(['not-found', 'permission-denied', 'unavailable', 'resource-exhausted'])('propagates real Firebase error.name %s without a browser fallback', async code => {
    mock.invoke.mockResolvedValue({ data: null, error: { message: 'Service unavailable', name: code } });
    await expect(tokenMarketplaceRequest({ action: 'state' })).rejects.toMatchObject({ code });
    expect(mock.invoke).toHaveBeenCalledTimes(1);
  });
  it('rejects a false success and wrong-item confirmation', async () => {
    mock.invoke.mockResolvedValueOnce({ data: { success: false, error: 'Insufficient tokens' }, error: null });
    await expect(tokenMarketplaceRequest({ action: 'purchase', itemId: 'xp_boost_2x', expectedCost: 75, requestId: 'r' })).rejects.toThrow('Insufficient');
    mock.invoke.mockResolvedValueOnce({ data: { success: true, balance: 25, item_id: 'different' }, error: null });
    await expect(tokenMarketplaceRequest({ action: 'purchase', itemId: 'xp_boost_2x', expectedCost: 75, requestId: 'r' })).rejects.toThrow('not confirmed');
  });
  it('rejects old account leases after A→B→A even without a React render', async () => {
    const guard = tokenAccountGuard('alice'); switchTo('bob'); switchTo('alice');
    expect(guard).toThrow('account changed');
    await expect(tokenMarketplaceRequest({ action: 'state' }, guard)).rejects.toMatchObject({ code: 'account-changed' });
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it('discards an old-account response after the transport completes', async () => {
    mock.invoke.mockImplementation(async () => { switchTo('bob'); return { data: state(), error: null }; });
    await expect(tokenMarketplaceRequest({ action: 'state' })).rejects.toMatchObject({ code: 'account-changed' });
  });
  it('retains receipt IDs until confirmation, scoped by account and action', () => {
    const first = tokenAttempt('purchase', 'alice', 'xp', 75);
    expect(tokenAttempt('purchase', 'alice', 'xp', 75).requestId).toBe(first.requestId);
    expect(tokenAttempt('activate', 'alice', 'xp').requestId).not.toBe(first.requestId);
    first.complete(); expect(tokenAttempt('purchase', 'alice', 'xp', 75).requestId).not.toBe(first.requestId);
  });
  it('recovers a stored receipt after reload and removes it only on confirmation', () => {
    const key = JSON.stringify(['alice', 'purchase', 'reload-item', 75]);
    sessionStorage.setItem('vybe-token-attempts-v1', JSON.stringify({ [key]: 'retained-reload-receipt' }));
    const recovered = tokenAttempt('purchase', 'alice', 'reload-item', 75);
    expect(recovered.requestId).toBe('retained-reload-receipt');
    switchTo('bob'); switchTo('alice');
    expect(tokenAttempt('purchase', 'alice', 'reload-item', 75).requestId).toBe(recovered.requestId);
    expect(tokenAttempt('purchase', 'bob', 'reload-item', 75).requestId).not.toBe(recovered.requestId);
    recovered.complete();
    expect(JSON.parse(sessionStorage.getItem('vybe-token-attempts-v1')!)[key]).toBeUndefined();
  });
  it('rejects malformed activation receipts without acknowledging consumption', async () => {
    mock.invoke.mockResolvedValue({ data: { success: true, item_id: 'xp_boost_2x', boost: { expires_at: 'invalid' } }, error: null });
    await expect(tokenMarketplaceRequest({ action: 'activate', itemId: 'xp_boost_2x', requestId: 'r' })).rejects.toThrow('not confirmed');
  });
  it('legacy earn adapters ignore caller amounts, target owners and DNA descriptions', async () => {
    mock.invoke.mockResolvedValue({ data: { success: true, balance: 102, credited: 2 }, error: null });
    await expect(rpcEarnVybeTokens({ p_user_id: 'victim', p_amount: 99999999, p_type: 'comment_added', p_reference_id: 'actual-comment', p_description: '100x DNA' })).resolves.toBe(102);
    expect(mock.invoke).toHaveBeenCalledWith('token-marketplace', { action: 'earn', type: 'comment_added', referenceId: 'actual-comment' });
  });
  it('rejects unsupported legacy ad and arbitrary reward grants before transport', async () => {
    await expect(rpcEarnVybeTokens({ p_type: 'rewarded_ad', p_amount: 25 })).rejects.toThrow('not available');
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it('legacy purchase retries reuse the receipt and never perform a client debit', async () => {
    mock.invoke.mockResolvedValueOnce({ data: null, error: { name: 'unavailable', message: 'Response lost' } }).mockResolvedValueOnce({ data: { success: true, balance: 25, item_id: 'xp_boost_2x' }, error: null });
    const input = { p_item_id: 'xp_boost_2x', p_cost: 75 };
    await expect(rpcPurchaseMarketplaceItem(input)).rejects.toThrow('Response lost');
    await expect(rpcPurchaseMarketplaceItem(input)).resolves.toMatchObject({ success: true, new_balance: 25 });
    expect(mock.invoke.mock.calls[0][1].requestId).toBe(mock.invoke.mock.calls[1][1].requestId);
  });
});
