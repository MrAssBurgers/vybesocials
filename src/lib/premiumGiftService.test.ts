import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice' as string | null, invoke: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { functions: { invoke: state.invoke } }, getFirebaseAuth: () => ({ currentUser: state.uid ? { uid: state.uid } : null }) }));
import { acceptPremiumGift, createPremiumGift, listPremiumGifts, pendingPremiumGift, revokePremiumGift, verifiedPremiumStatus } from './premiumGiftService';
const gift = (extra = {}) => ({ id: 'grant-1', user_id: 'alice', gifted_by: 'staff', status: 'pending', is_active: false, is_expired: false, ...extra });
beforeEach(() => { state.uid = 'alice'; state.invoke.mockReset(); });

describe('premium gift service confirmations', () => {
  it('uses the authenticated recipient and explicit action', async () => {
    state.invoke.mockResolvedValue({ data: { ok: true, gift: gift({ status: 'accepted', is_active: true }) } });
    await acceptPremiumGift('alice', 'grant-1');
    expect(state.invoke).toHaveBeenCalledWith('premium-gift-manage', { body: { action: 'accept', grantId: 'grant-1' } });
  });
  it.each([
    { ok: false, gift: gift({ status: 'accepted', is_active: true }) },
    { ok: true, gift: gift() },
    { ok: true, gift: gift({ user_id: 'bob', status: 'accepted', is_active: true }) },
    { ok: true, gift: gift({ id: 'other', status: 'accepted', is_active: true }) },
    { ok: true, gift: gift({ is_expired: true, status: 'accepted', is_active: true }) },
    {},
  ])('does not confirm an incomplete or mismatched acceptance %j', async data => { state.invoke.mockResolvedValue({ data }); await expect(acceptPremiumGift('alice', 'grant-1')).rejects.toThrow(); });
  it('rejects service errors, unavailable responses and stale backend status shapes', async () => {
    state.invoke.mockResolvedValue({ error: { message: 'Temporarily unavailable' } }); await expect(pendingPremiumGift('alice')).rejects.toThrow('Temporarily unavailable');
    state.invoke.mockResolvedValue({ data: null }); await expect(pendingPremiumGift('alice')).rejects.toThrow('incomplete');
    state.invoke.mockResolvedValue({ data: { active: true } }); await expect(verifiedPremiumStatus('alice')).rejects.toThrow('unavailable');
  });
  it('rejects an account change before sending or after a response', async () => {
    state.uid = 'bob'; await expect(acceptPremiumGift('alice', 'grant-1')).rejects.toMatchObject({ name: 'PremiumAccountChanged' }); expect(state.invoke).not.toHaveBeenCalled();
    state.uid = 'alice'; state.invoke.mockImplementation(async () => { state.uid = 'bob'; return { data: { gift: null } }; });
    await expect(pendingPremiumGift('alice')).rejects.toMatchObject({ name: 'PremiumAccountChanged' });
  });
  it('does not return another account pending gift', async () => { state.invoke.mockResolvedValue({ data: { gift: { id: 'grant-1', user_id: 'bob', gifterUsername: 'staff' } } }); await expect(pendingPremiumGift('alice')).rejects.toThrow('unavailable'); });
  it('does not claim a revoked create replay was a new success', async () => { state.invoke.mockResolvedValue({ data: { ok: true, gift: gift({ status: 'revoked' }) } }); await expect(createPremiumGift('alice', 'alice', 'request-1')).rejects.toThrow('changed'); });
  it('revocation requires matching grant, recipient, status and acknowledgment', async () => {
    for (const change of [{ id: 'other' }, { user_id: 'bob' }, { status: 'accepted' }]) { state.invoke.mockResolvedValue({ data: { ok: true, gift: gift({ status: 'revoked', ...change }) } }); await expect(revokePremiumGift('alice', 'alice', 'grant-1')).rejects.toThrow(); }
    state.invoke.mockResolvedValue({ data: { ok: true, gift: gift({ status: 'revoked' }) } }); await expect(revokePremiumGift('alice', 'alice', 'grant-1')).resolves.toBeUndefined();
  });
  it('lists valid statuses without treating an unavailable result as an empty list', async () => {
    state.invoke.mockResolvedValue({ data: {} }); await expect(listPremiumGifts('alice')).rejects.toThrow();
    state.invoke.mockResolvedValue({ data: { gifts: [gift()] } }); expect(await listPremiumGifts('alice', ['alice'])).toEqual([gift()]);
  });
});
