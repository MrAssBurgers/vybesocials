// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { cloudSpaceAudioOrigin, spaceAudioProvider, type SpaceAudioRevocation } from '../../functions/src/_shared/spaceAudioProvider';
const roomName = `space_v1_${'a'.repeat(64)}`;
const plan: SpaceAudioRevocation = { roomName, identities: ['profile-one', 'profile-two'], cutoffSeconds: 1791280000 };
function setup() {
  const api = { removeParticipant: vi.fn(async (_room: string, _identity: string, _options: { revokeTokenTs: bigint }) => {}), deleteRoom: vi.fn(async (_room: string) => {}) };
  return { api, provider: spaceAudioProvider(api, 'wss://synthetic.livekit.cloud') };
}
describe('checked existing audio provider', () => {
  it.each(['wss://synthetic.livekit.cloud', 'https://synthetic.livekit.cloud/', 'https://synthetic.livekit.cloud:443'])('uses secure Cloud origin %s', url => {
    expect(cloudSpaceAudioOrigin(url)).toBe('https://synthetic.livekit.cloud');
  });
  it.each(['invalid', 'ws://synthetic.livekit.cloud', 'http://synthetic.livekit.cloud', 'https://attacker.test', 'https://livekit.cloud.attacker.test', 'https://synthetic.livekit.cloud/path', 'https://user:secret@synthetic.livekit.cloud', 'https://synthetic.livekit.cloud?secret=hidden', 'https://synthetic.livekit.cloud#fragment', 'https://synthetic.livekit.cloud:8443'])('rejects unsupported endpoint %s', url => {
    expect(() => cloudSpaceAudioOrigin(url)).toThrow();
  });
  it('revokes every unique identity with the recorded explicit cutoff', async () => {
    const { api, provider } = setup();
    await provider.revoke({ ...plan, identities: [...plan.identities, plan.identities[0]] });
    expect(api.removeParticipant.mock.calls).toEqual([
      [roomName, 'profile-one', { revokeTokenTs: BigInt(plan.cutoffSeconds) }],
      [roomName, 'profile-two', { revokeTokenTs: BigInt(plan.cutoffSeconds) }],
    ]);
    expect(api.deleteRoom).not.toHaveBeenCalled();
  });
  it('removes participants before deleting the room', async () => {
    const { api, provider } = setup(); const steps: string[] = [];
    api.removeParticipant.mockImplementation(async () => { steps.push('remove'); });
    api.deleteRoom.mockImplementation(async () => { steps.push('delete'); });
    await provider.close(plan); expect(steps).toEqual(['remove', 'remove', 'delete']);
  });
  it('does not close or report success when removal is uncertain', async () => {
    const { api, provider } = setup(); api.removeParticipant.mockRejectedValueOnce(new Error('transport failure with confidential details'));
    await expect(provider.close(plan)).rejects.toMatchObject({ code: 'unavailable', message: 'The audio room could not be closed. Please retry.' });
    expect(api.deleteRoom).not.toHaveBeenCalled();
    await provider.close(plan); expect(api.deleteRoom).toHaveBeenCalledOnce();
    expect(api.removeParticipant.mock.calls.every(call => (call[2] as any).revokeTokenTs === BigInt(plan.cutoffSeconds))).toBe(true);
  });
  it('requires confirmation for missing-participant responses instead of guessing revocation', async () => {
    const { api, provider } = setup(); api.removeParticipant.mockRejectedValue(Object.assign(new Error('missing'), { code: 'not_found' }));
    await expect(provider.revoke(plan)).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('only treats an absent room as closed after identity revocation succeeds', async () => {
    const { api, provider } = setup(); api.deleteRoom.mockRejectedValue(Object.assign(new Error('missing'), { code: 'not_found' }));
    await expect(provider.close(plan)).resolves.toBeUndefined();
    api.deleteRoom.mockRejectedValue(Object.assign(new Error('offline'), { code: 'unavailable' }));
    await expect(provider.close(plan)).rejects.toMatchObject({ code: 'unavailable' });
  });
  it.each([{ roomName: 'comm_other' }, { cutoffSeconds: -1 }, { cutoffSeconds: 1.5 }, { identities: ['bad/id'] }, { identities: [''] }, { identities: new Array(401).fill('too-many') }])('validates the whole plan before any provider side effect %j', async invalid => {
    const { api, provider } = setup(); await expect(provider.close({ ...plan, ...invalid })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(api.removeParticipant).not.toHaveBeenCalled(); expect(api.deleteRoom).not.toHaveBeenCalled();
  });
  it('bounds concurrent removals to five', async () => {
    const { api, provider } = setup(); let active = 0, peak = 0;
    api.removeParticipant.mockImplementation(async () => { active++; peak = Math.max(active, peak); await Promise.resolve(); active--; });
    await provider.close({ ...plan, identities: Array.from({ length: 12 }, (_, i) => `profile-${i}`) });
    expect(peak).toBe(5); expect(api.removeParticipant).toHaveBeenCalledTimes(12);
  });
});
