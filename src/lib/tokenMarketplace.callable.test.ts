// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ db: {}, requireAuth: vi.fn(), rateLimit: vi.fn(), resolve: vi.fn(), state: vi.fn(), purchase: vi.fn(), activate: vi.fn(), equip: vi.fn(), earn: vi.fn() }));
vi.mock('../../functions/src/_shared/admin', () => ({ db: mocks.db, requireAuth: mocks.requireAuth, rateLimit: mocks.rateLimit,
  enforceRateLimit: (allowed: boolean) => { if (!allowed) throw Object.assign(new Error('Rate limited'), { code: 'resource-exhausted' }); } }));
vi.mock('../../functions/src/_shared/tokenMarketplaceAuthority', () => ({ resolveTokenActor: mocks.resolve, tokenMarketplaceState: mocks.state, purchaseTokenItem: mocks.purchase, activateTokenBoost: mocks.activate, equipTokenItem: mocks.equip }));
vi.mock('../../functions/src/_shared/tokenCreditAuthority', () => ({ claimTokenCredit: mocks.earn }));
import { tokenMarketplace } from '../../functions/src/tokenMarketplace';
const actor = { authUid: 'caller', profileId: 'legacy' };
const call = (data: unknown) => tokenMarketplace.run({ data, auth: { uid: 'caller', token: {} } } as never);
beforeEach(() => {
  vi.clearAllMocks(); mocks.requireAuth.mockReturnValue('caller'); mocks.rateLimit.mockResolvedValue(true); mocks.resolve.mockResolvedValue(actor);
  for (const handler of [mocks.state, mocks.purchase, mocks.activate, mocks.equip, mocks.earn]) handler.mockResolvedValue({ success: true });
});
describe('marketplace authenticated callable', () => {
  it('requires authentication before rate/database access', async () => {
    mocks.requireAuth.mockImplementation(() => { throw Object.assign(new Error('Sign in'), { code: 'unauthenticated' }); });
    await expect(call({ action: 'state' })).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(mocks.rateLimit).not.toHaveBeenCalled(); expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, 'state', { action: 'unknown' }])('rejects invalid input %j before paid database reads', async data => {
    await expect(call(data)).rejects.toMatchObject({ code: 'invalid-argument' }); expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('enforces its general request limit before resolving the account', async () => {
    mocks.rateLimit.mockResolvedValue(false);
    await expect(call({ action: 'state' })).rejects.toMatchObject({ code: 'resource-exhausted' }); expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('enforces a separate mutation limit', async () => {
    mocks.rateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(call({ action: 'purchase' })).rejects.toMatchObject({ code: 'resource-exhausted' }); expect(mocks.purchase).not.toHaveBeenCalled();
  });
  it.each([['purchase', 'purchase'], ['activate', 'activate'], ['equip', 'equip']] as const)('routes %s with the resolved caller identity only', async (action, handler) => {
    const data = { action, user_id: 'victim', profileId: 'victim', itemId: 'xp_boost_2x', requestId: 'request', expectedCost: 75 };
    await call(data);
    expect(mocks.resolve).toHaveBeenCalledWith(mocks.db, 'caller');
    expect(mocks[handler]).toHaveBeenCalledWith(mocks.db, actor, data);
    expect(mocks.rateLimit).toHaveBeenCalledWith('token-marketplace-mutation:caller', 30, 60);
  });
  it('does not forward caller amount/multiplier/time to earning authority', async () => {
    await call({ action: 'earn', type: 'post_created', referenceId: 'post', amount: 10000, multiplier: 999, nowMs: 1 });
    expect(mocks.earn).toHaveBeenCalledWith(mocks.db, actor, { type: 'post_created', referenceId: 'post' });
  });
  it('loads current account state without charging the mutation limiter', async () => {
    await call({ action: 'state', uid: 'victim' }); expect(mocks.state).toHaveBeenCalledWith(mocks.db, actor); expect(mocks.rateLimit).toHaveBeenCalledTimes(1);
  });
  it('preserves authority failures instead of returning false success', async () => {
    mocks.purchase.mockRejectedValue(Object.assign(new Error('Insufficient tokens'), { code: 'failed-precondition' }));
    await expect(call({ action: 'purchase' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
