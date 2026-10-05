import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ read: vi.fn(), invoke: vi.fn(), auth: null as any, listener: null as any }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ getDocumentFromServer: mock.read }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: mock.invoke }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => mock.auth }));
import { beginEmailConfirmation, checkedEmailChallenge } from './emailConfirmation';
beforeEach(() => { vi.resetAllMocks(); mock.listener = null; mock.auth = { currentUser: {uid:'alice'}, onAuthStateChanged: (fn: any) => {mock.listener=fn;return () => {}; } }; mock.read.mockResolvedValue({ email_2fa_enabled: true }); });
it('does not send when the account has no enabled email confirmation', async () => {
  mock.read.mockResolvedValue(null); expect(await beginEmailConfirmation('alice')).toBeNull();
  expect(mock.invoke).not.toHaveBeenCalled();
});
it('does not bypass a settings read or provider failure', async () => {
  mock.read.mockRejectedValueOnce(Error('network')); await expect(beginEmailConfirmation('alice')).rejects.toThrow('network');
  mock.invoke.mockResolvedValue({ data: null, error: { code: 'unavailable' } });
  await expect(beginEmailConfirmation('alice')).rejects.toThrow('unavailable');
});
it.each([{ ok: true }, {}, { ok: false }, { ok: true, challengeId: 'alice', expiresAt: 'bad' }, { ok: true, challengeId: 'alice', expiresAt: new Date(0).toISOString() }])('rejects an incomplete/expired challenge: %j', async data => {
  mock.invoke.mockResolvedValue({ data, error: null });
  await expect(beginEmailConfirmation('alice')).rejects.toThrow('could not be started');
});
it('accepts a current receipt and refuses a resend switched to another challenge', async () => {
  const data = { ok: true, ownerUid: 'alice', challengeId: 'challenge-one', expiresAt: new Date(Date.now() + 600_000).toISOString() };
  mock.invoke.mockResolvedValue({ data, error: null });
  expect(await beginEmailConfirmation('alice')).toEqual({ challengeId: data.challengeId, expiresAt: data.expiresAt });
  expect(() => checkedEmailChallenge(data, 'challenge-two')).toThrow();
});

it('does not send under a newly active account after settings return', async () => {
  mock.read.mockImplementation(async () => { mock.auth.currentUser = {uid:'bob'}; mock.listener?.(mock.auth.currentUser); return {email_2fa_enabled:true}; });
  await expect(beginEmailConfirmation('alice')).rejects.toThrow('account changed');
  expect(mock.invoke).not.toHaveBeenCalled();
});
it('rejects a late response even after changing away and back to the same UID', async () => {
  mock.invoke.mockImplementation(async (_name, input) => {
    expect(input.expectedOwnerUid).toBe('alice');
    for(const uid of ['bob','alice']) {mock.auth.currentUser={uid};mock.listener?.(mock.auth.currentUser);}
    return {data:{ok:true,ownerUid:'alice',challengeId:'one',expiresAt:new Date(Date.now()+600_000).toISOString()},error:null};
  });
  await expect(beginEmailConfirmation('alice')).rejects.toThrow('account changed');
});
it('rejects a challenge issued to another account', async () => {
  mock.invoke.mockResolvedValue({data:{ok:true,ownerUid:'bob',challengeId:'one',expiresAt:new Date(Date.now()+600_000).toISOString()},error:null});
  await expect(beginEmailConfirmation('alice')).rejects.toThrow('could not be started');
});
