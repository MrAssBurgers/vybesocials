import { beforeEach, describe, expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('./firebase/functionsService', () => ({ invokeFunction: invoke }));
import { managePostLocalArea } from './postLocalAreaService';
const input = { expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice', postId: 'one', action: 'share' as const, revision: 2, area: { lat: 41.9, lng: -87.6 } };
const receipt = { ownerUid: 'alice', profileId: 'profile-alice', postId: 'one', action: 'share', revision: 3, enabled: true };
beforeEach(() => { invoke.mockReset(); invoke.mockResolvedValue({ data: { ...receipt } }); });
describe('acknowledged Local sharing', () => {
  it('requires a matching owner, post, revision and action receipt', async () => {
    const guard = vi.fn(); expect(await managePostLocalArea(input, guard)).toEqual(receipt); expect(guard).toHaveBeenCalledTimes(2);
    for (const patch of [{ ownerUid: 'bob' }, { profileId: 'old' }, { postId: 'other' }, { revision: 2 }, { action: 'remove' }, { enabled: false }, { area: input.area }]) {
      invoke.mockResolvedValueOnce({ data: { ...receipt, ...patch } }); await expect(managePostLocalArea(input, guard)).rejects.toThrow();
    }
  });
  it('never turns a failed or late-account write into acknowledged sharing', async () => {
    invoke.mockResolvedValueOnce({ error: { message: 'Denied' } }); await expect(managePostLocalArea(input, () => {})).rejects.toThrow('Denied');
    const guard = vi.fn().mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('Account changed'); });
    await expect(managePostLocalArea(input, guard)).rejects.toThrow('Account changed');
  });
});
