import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ invoke: vi.fn(), uid: 'alice', epoch: 1 }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: mock.invoke }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountGuard: (uid: string) => { const epoch = mock.epoch; return () => { if (uid !== mock.uid || epoch !== mock.epoch) throw new Error('Account changed'); }; } }));
import { capturePhoneVerificationActor, confirmPhoneVerification, normalizeVerificationPhone, phoneVerificationState, requestPhoneVerification } from './phoneVerificationService';
const uuid = '11111111-1111-4111-8111-111111111111';
const actor = () => capturePhoneVerificationActor('alice', 'alice-profile', () => {});
const receipt = (fields: object) => ({ data: { ok: true, ownerUid: 'alice', profileId: 'alice-profile', ...fields }, error: null });
const send = () => requestPhoneVerification(actor(), { phone: '+13125550100', requestId: uuid });
const challenge = () => ({ challengeId: uuid, maskedPhone: '+•••0100', expiresAt: Date.now() + 600000 });
beforeEach(() => { mock.invoke.mockReset(); mock.uid = 'alice'; mock.epoch++; });
describe('checked phone verification contracts', () => {
  it('reads canonical status without consulting legacy private profile flags', async () => {
    mock.invoke.mockResolvedValue(receipt({ verified: false, maskedPhone: null, legacyPhoneNeedsVerification: true }));
    await expect(phoneVerificationState(actor())).resolves.toMatchObject({ verified: false, legacyPhoneNeedsVerification: true });
    expect(mock.invoke).toHaveBeenCalledWith('phoneVerificationState', { expectedOwnerUid: 'alice', expectedProfileId: 'alice-profile' });
  });
  it.each([{ verified: true, maskedPhone: null, legacyPhoneNeedsVerification: false }, { verified: true, maskedPhone: '+13125550100', legacyPhoneNeedsVerification: false }, { verified: false, maskedPhone: null }])('rejects malformed or over-disclosing state %j', async data => {
    mock.invoke.mockResolvedValue(receipt(data)); await expect(phoneVerificationState(actor())).rejects.toThrow('not be verified');
  });
  it('requires exact request destination masking and a live checked challenge', async () => {
    mock.invoke.mockResolvedValue(receipt(challenge())); await expect(send()).resolves.toMatchObject({ challengeId: uuid });
    expect(mock.invoke).toHaveBeenCalledWith('phoneVerifyRequest', { phone: '+13125550100', requestId: uuid, expectedOwnerUid: 'alice', expectedProfileId: 'alice-profile' });
    for (const fields of [{}, { ...challenge(), challengeId: undefined }, { ...challenge(), maskedPhone: '+•••9999' }, { ...challenge(), expiresAt: Date.now() - 1 }]) {
      mock.invoke.mockResolvedValue(receipt(fields)); await expect(send()).rejects.toThrow('not confirmed');
    }
  });
  it('requires affirmative verification of exactly the challenged phone', async () => {
    const input = { challengeId: uuid, code: '123456', expectedPhone: '+13125550100' };
    for (const fields of [{ phone: input.expectedPhone }, { phone: input.expectedPhone, verified: false }, { phone: '+13125550101', verified: true }]) {
      mock.invoke.mockResolvedValue(receipt(fields)); await expect(confirmPhoneVerification(actor(), input)).rejects.toThrow('not confirmed');
    }
    mock.invoke.mockResolvedValue(receipt({ phone: input.expectedPhone, verified: true }));
    await expect(confirmPhoneVerification(actor(), input)).resolves.toMatchObject({ phone: input.expectedPhone, verified: true });
    expect(mock.invoke).toHaveBeenLastCalledWith('phoneVerifyConfirm', { challengeId: uuid, code: '123456', expectedOwnerUid: 'alice', expectedProfileId: 'alice-profile' });
  });
  it.each(['ownerUid', 'profileId'])('rejects another %s in every receipt', async field => {
    mock.invoke.mockResolvedValue(receipt({ ...challenge(), [field]: 'other' })); await expect(send()).rejects.toThrow('could not be verified');
    mock.invoke.mockResolvedValue(receipt({ verified: false, maskedPhone: null, legacyPhoneNeedsVerification: false, [field]: 'other' })); await expect(phoneVerificationState(actor())).rejects.toThrow('could not be verified');
    mock.invoke.mockResolvedValue(receipt({ verified: true, phone: '+13125550100', [field]: 'other' })); await expect(confirmPhoneVerification(actor(), { challengeId: uuid, code: '123456', expectedPhone: '+13125550100' })).rejects.toThrow('could not be verified');
  });
  it('preserves safe backend sign-in guidance instead of masking it', async () => {
    mock.invoke.mockResolvedValue({ data: null, error: { code: 'failed-precondition', message: 'Sign out and sign in again, then retry.' } });
    await expect(send()).rejects.toMatchObject({ code: 'failed-precondition', message: 'Sign out and sign in again, then retry.' });
  });
  it('rejects stale account epochs and cancelled reads even after a valid late receipt', async () => {
    let resolve!: (value: unknown) => void; mock.invoke.mockReturnValue(new Promise(done => { resolve = done; }));
    const pending = send(); mock.epoch += 2; resolve(receipt(challenge())); await expect(pending).rejects.toThrow('Account changed');
    const controller = new AbortController(); controller.abort(); mock.invoke.mockClear();
    await expect(phoneVerificationState(actor(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' }); expect(mock.invoke).not.toHaveBeenCalled();
  });
  it.each(['+13125550100 ext 3', 'call3125550100', '+03125550100', '020 7946 0958', '++13125550100'])('rejects ambiguous or unsafe phone %s', value => expect(normalizeVerificationPhone(value)).toBeNull());
});
