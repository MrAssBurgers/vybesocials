import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), session: { uid: 'owner', epoch: 1 } }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: mocks.invoke }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => mocks.session, reportAccountGuard: (uid: string) => { const epoch = mocks.session.epoch; return () => { if (uid !== mocks.session.uid || epoch !== mocks.session.epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' }); }; } }));
import { spaceAuthorityRequest, spaceMutation } from '@/lib/spaceAuthorityClient';
const actor = { uid: 'owner', profileId: 'profile', epoch: 1 };
const response = (action: string) => ({ data: { ok: true, ownerUid: 'owner', profileId: 'profile', action }, error: null });
beforeEach(() => { vi.clearAllMocks(); mocks.session = { uid: 'owner', epoch: 1 }; sessionStorage.clear(); });
it('sends checked actor identity and rejects another profile response', async () => {
  mocks.invoke.mockResolvedValue(response('read'));
  await spaceAuthorityRequest(actor, { action: 'read', spaceId: 'room' });
  expect(mocks.invoke).toHaveBeenCalledWith('manageSpaces', { action: 'read', spaceId: 'room', expectedOwnerUid: 'owner', expectedProfileId: 'profile' });
  mocks.invoke.mockResolvedValue({ ...response('read'), data: { ...response('read').data, profileId: 'wrong' } });
  await expect(spaceAuthorityRequest(actor, { action: 'read' })).rejects.toThrow('could not be confirmed');
});
it('retains receipt and original revision across ambiguous retry after refresh', async () => {
  const intent = { spaceId: 'uncertain-room' };
  mocks.invoke.mockResolvedValueOnce({ data: null, error: { name: 'unavailable', message: 'Network failed' } }).mockResolvedValue(response('leave'));
  await expect(spaceMutation(actor, 'leave', intent, 3)).rejects.toThrow('Network failed');
  await spaceMutation(actor, 'leave', intent, 5);
  expect(mocks.invoke.mock.calls[1][1].requestId).toBe(mocks.invoke.mock.calls[0][1].requestId);
  expect(mocks.invoke.mock.calls[1][1].revision).toBe(3);
});
it('confirmed completion permits a deliberate new change', async () => {
  mocks.invoke.mockResolvedValue(response('mute'));
  await spaceMutation(actor, 'mute', { spaceId: 'confirmed', isMuted: true }, 2);
  await spaceMutation(actor, 'mute', { spaceId: 'confirmed', isMuted: true }, 3);
  expect(mocks.invoke.mock.calls[1][1].requestId).not.toBe(mocks.invoke.mock.calls[0][1].requestId);
  expect(mocks.invoke.mock.calls[1][1].revision).toBe(3);
});
it('definite revision rejection allows retry with fresh state', async () => {
  mocks.invoke.mockResolvedValueOnce({ data: null, error: { name: 'failed-precondition', message: 'Changed' } }).mockResolvedValue(response('hand'));
  await expect(spaceMutation(actor, 'hand', { spaceId: 'fresh', raised: true }, 2)).rejects.toThrow('Changed');
  await spaceMutation(actor, 'hand', { spaceId: 'fresh', raised: true }, 3);
  expect(mocks.invoke.mock.calls[1][1].revision).toBe(3);
  expect(mocks.invoke.mock.calls[1][1].requestId).not.toBe(mocks.invoke.mock.calls[0][1].requestId);
});
it('same-UID session replacement rejects late responses', async () => {
  mocks.invoke.mockImplementation(async () => { mocks.session = { uid: 'owner', epoch: 2 }; return response('read'); });
  await expect(spaceAuthorityRequest(actor, { action: 'read' })).rejects.toMatchObject({ code: 'account-changed' });
});
it('cancelled read never reaches Firebase', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(spaceAuthorityRequest(actor, { action: 'read' }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(mocks.invoke).not.toHaveBeenCalled();
});
