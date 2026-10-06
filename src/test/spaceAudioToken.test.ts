// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { mintCheckedSpaceAudioToken, spaceAudioTokenSigner, type SpaceAdmission } from '../../functions/src/_shared/spaceAudioToken';
const input = { expectedOwnerUid: 'owner', expectedProfileId: 'profile', spaceId: 'room' };
const admission: SpaceAdmission = { ownerUid: 'owner', profileId: 'profile', identity: 'profile', roomName: `space_v1_${'a'.repeat(64)}`, generation: 1, notBeforeSeconds: 0, role: 'listener', canPublish: false, displayName: 'Synthetic profile' };
function services() {
  let time = 100000;
  return { admit: vi.fn(async () => ({ ...admission })), mint: vi.fn(async () => 'synthetic-token'), now: () => time,
    sleep: vi.fn(async (ms: number) => { time += ms; }) };
}
it('mints only after server admission and rechecks before returning the token', async () => {
  const service = services(); const result = await mintCheckedSpaceAudioToken('owner', input, service);
  expect(result.canPublish).toBe(false); expect(service.admit).toHaveBeenCalledTimes(3); expect(service.mint).toHaveBeenCalledOnce();
});
it('waits past the recorded cutoff and rechecks access after waiting', async () => {
  const service = services(); service.admit.mockResolvedValue({ ...admission, notBeforeSeconds: 102 });
  await mintCheckedSpaceAudioToken('owner', input, service); expect(service.sleep).toHaveBeenCalledWith(2000);
});
it.each([{ generation: 2 }, { role: 'speaker', canPublish: true }, { roomName: `space_v1_${'b'.repeat(64)}` }, { ownerUid: 'replacement' }, { profileId: 'replacement', identity: 'replacement' }])('discards signed tokens after access changes %j', async change => {
  const service = services(); service.admit.mockResolvedValueOnce(admission).mockResolvedValueOnce(admission).mockResolvedValue({ ...admission, ...change });
  await expect(mintCheckedSpaceAudioToken('owner', input, service)).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(service.mint).toHaveBeenCalledOnce();
});
it('never signs after a revoked or pending membership fails admission', async () => {
  const service = services(); service.admit.mockResolvedValueOnce(admission).mockRejectedValueOnce(Object.assign(new Error('pending'), { code: 'unavailable' }));
  await expect(mintCheckedSpaceAudioToken('owner', input, service)).rejects.toMatchObject({ code: 'unavailable' }); expect(service.mint).not.toHaveBeenCalled();
});
it.each([{ canPublish: true }, { generation: 0 }, { roomName: 'comm_unrelated' }, { notBeforeSeconds: -1 }])('rejects malformed server admission %j', async change => {
  const service = services(); service.admit.mockResolvedValue({ ...admission, ...change });
  await expect(mintCheckedSpaceAudioToken('owner', input, service)).rejects.toMatchObject({ code: 'failed-precondition' }); expect(service.mint).not.toHaveBeenCalled();
});
it.each([{ ...input, canPublish: true }, { ...input, action: 'join' }, { ...input, expectedOwnerUid: 'other' }])('rejects substituted client details before admission %j', async request => {
  const service = services(); await expect(mintCheckedSpaceAudioToken('owner', request, service)).rejects.toBeDefined(); expect(service.admit).not.toHaveBeenCalled();
});
it('does not wait indefinitely for a future cutoff', async () => {
  const service = services(); service.admit.mockResolvedValue({ ...admission, notBeforeSeconds: 200 });
  await expect(mintCheckedSpaceAudioToken('owner', input, service)).rejects.toMatchObject({ code: 'unavailable' }); expect(service.sleep).not.toHaveBeenCalled();
});
it('does not sign if a paused timer has not reached its cutoff', async () => {
  const service = services(); service.admit.mockResolvedValue({ ...admission, notBeforeSeconds: 102 }); service.sleep.mockImplementation(async () => {});
  await expect(mintCheckedSpaceAudioToken('owner', input, service)).rejects.toMatchObject({ code: 'unavailable' }); expect(service.mint).not.toHaveBeenCalled();
});
it('signs microphone-only speaker and subscribe-only listener grants using the installed SDK', async () => {
  const signer = await spaceAudioTokenSigner({ LIVEKIT_URL: 'wss://synthetic.livekit.cloud', LIVEKIT_API_KEY: 'synthetic-key', LIVEKIT_API_SECRET: 'synthetic-secret-only-for-local-tests' });
  for (const canPublish of [false, true]) {
    const token = await signer.mint({ ...admission, role: canPublish ? 'speaker' : 'listener', canPublish });
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(claims.sub).toBe('profile'); expect(claims.video.room).toBe(admission.roomName);
    expect(claims.video.canPublish).toBe(canPublish); expect(claims.video.canPublishData).toBe(false); expect(claims.video.canUpdateOwnMetadata).toBe(false);
    expect(claims.video.canPublishSources).toEqual(canPublish ? ['microphone'] : []); expect(claims.exp - claims.nbf).toBe(60);
  }
});
