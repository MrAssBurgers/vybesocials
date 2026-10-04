import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ invoke: vi.fn(), uid: 'alice', epoch: 1 }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: mock.invoke }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountGuard: (uid: string) => { const epoch = mock.epoch; return () => { if (mock.uid !== uid || mock.epoch !== epoch) throw new Error('account changed'); }; } }));
import { captureContactActor, contactDiscoveryState, matchDeviceContacts, normalizeContactPhone } from './contactDiscoveryService';
import { hashPhoneE164 } from './phone';
const actor = () => captureContactActor('alice', 'profile-alice');
const receipt = (data: object) => ({ data: { success: true, ownerUid: 'alice', profileId: 'profile-alice', ...data }, error: null });
beforeEach(() => { mock.invoke.mockReset(); mock.uid = 'alice'; mock.epoch = 1; vi.stubGlobal('crypto', webcrypto); });
describe('verified contact requests', () => {
  it('requires account and exact preference acknowledgement', async () => {
    const valid = { eligible: true, discoverable: true, maskedPhone: '+•••0123', legacyPhoneNeedsVerification: false };
    mock.invoke.mockResolvedValue(receipt(valid));
    await expect(contactDiscoveryState(actor(), true)).resolves.toMatchObject({ discoverable: true });
    expect(mock.invoke).toHaveBeenCalledWith('match-contacts', { action: 'setDiscoverable', discoverable: true, expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice' });
    mock.invoke.mockResolvedValue(receipt({ ...valid, discoverable: false })); await expect(contactDiscoveryState(actor(), true)).rejects.toThrow('not confirmed');
    mock.invoke.mockResolvedValue({ data: { ...receipt(valid).data, ownerUid: 'bob' }, error: null }); await expect(contactDiscoveryState(actor())).rejects.toThrow('not confirmed');
  });
  it('hashes all selected numbers and deduplicates without sending names or raw phones', async () => {
    const hash = await hashPhoneE164('+15555550123');
    mock.invoke.mockResolvedValue(receipt({ matches: [{ id: 'bob-profile', username: 'bob', display_name: null, avatar_url: null, is_verified: false, phone_hash: hash }] }));
    const result = await matchDeviceContacts([{ name: 'Private address book name', phones: ['+1 (555) 555-0123', '+15555550123', 'abc'] }], actor());
    expect(result).toMatchObject({ checked: 1, skipped: 1, matches: [{ contactName: 'Private address book name' }], invites: [] });
    expect(mock.invoke.mock.calls[0][1]).toEqual({ action: 'match', hashes: [hash], expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice' });
  });
  it('uses bounded requests and never returns partial results if a later batch fails', async () => {
    const phones = Array.from({ length: 201 }, (_, i) => `+1555000${String(i).padStart(4, '0')}`);
    mock.invoke.mockResolvedValueOnce(receipt({ matches: [] })).mockResolvedValueOnce({ data: null, error: { message: 'Daily limit' } });
    await expect(matchDeviceContacts([{ name: '', phones }], actor())).rejects.toThrow('Daily limit');
    expect(mock.invoke.mock.calls.map(call => call[1].hashes.length)).toEqual([200, 1]);
  });
  it('rejects an unrelated match and raw phone disclosures', async () => {
    const hash = await hashPhoneE164('+15555550123'), match = { id: 'bob', username: 'bob', display_name: null, avatar_url: null, is_verified: false, phone_hash: hash };
    mock.invoke.mockResolvedValue(receipt({ matches: [{ ...match, phone_hash: 'f'.repeat(64) }] }));
    await expect(matchDeviceContacts([{ name: '', phones: ['+15555550123'] }], actor())).rejects.toThrow('Invalid contact results');
    mock.invoke.mockResolvedValue(receipt({ matches: [{ ...match, phone_number: '+15555550123' }] }));
    await expect(matchDeviceContacts([{ name: '', phones: ['+15555550123'] }], actor())).rejects.toThrow('Invalid contact results');
  });
  it('rejects late results after an away-and-back account transition', async () => {
    let resolve!: (value: unknown) => void; mock.invoke.mockReturnValue(new Promise(done => { resolve = done; }));
    const request = contactDiscoveryState(actor()); mock.uid = 'bob'; mock.epoch++; mock.uid = 'alice'; mock.epoch++;
    resolve(receipt({ eligible: false, discoverable: false, maskedPhone: null, legacyPhoneNeedsVerification: true }));
    await expect(request).rejects.toThrow('account changed');
  });
  it.each([['(312) 555-0100', '+13125550100'], ['+44 20 7946 0958', '+442079460958'], ['020 7946 0958', null], ['+15555550100 ext 4', null], ['++15555550100', null], ['+05555550100', null], ['123', null]])('normalizes conservatively: %s', (input, expected) => expect(normalizeContactPhone(input)).toBe(expected));
});
