import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ call: vi.fn(), epoch: 1, user: { uid: 'alice', metadata: { creationTime: '2026-01-01T00:00:00Z' } } }));
vi.mock('./firebase/authService', () => ({ getFirebaseAuth: () => ({ currentUser: state.user }) }));
vi.mock('./firebase/functionsService', () => ({ invokeFunction: (...args: unknown[]) => state.call(...args) }));
vi.mock('./profileAccountGuard', () => ({ profileAccountGuard: (uid: string, extra: () => void) => {
  const epoch = state.epoch; return () => { extra(); if (state.epoch !== epoch || state.user.uid !== uid) throw new Error('Account changed'); };
} }));
import { readPeopleDiscovery } from './peopleDiscoveryService';
const actor = { uid: 'alice', profileId: 'profile-alice' }, guard = () => {};
const profile = { id: 'profile-bob', username: 'bob', display_name: null, avatar_url: null, interests: ['music'] };
const receipt = (patch: object = {}) => ({ ok: true, ownerUid: actor.uid, profileId: actor.profileId,
  accountCreatedAt: Date.parse(state.user.metadata.creationTime), serverTime: 1000, leaseUntil: 16000, ageReviewRequired: false, profiles: [profile], ...patch });
beforeEach(() => { vi.clearAllMocks(); state.epoch++; state.user = { uid: 'alice', metadata: { creationTime: '2026-01-01T00:00:00Z' } }; state.call.mockResolvedValue({ data: receipt(), error: null }); });
afterEach(() => vi.useRealTimers());
it('binds the SDK account and canonical profile without persisting suggestions', async () => {
  const before = JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } });
  const result = await readPeopleDiscovery(actor, { candidateIds: [profile.id] }, guard);
  expect(result.profiles).toEqual([profile]); expect(result.validUntil).toBeGreaterThan(Date.now());
  expect(state.call).toHaveBeenCalledWith('getDiscoveryProfiles', { candidateIds: [profile.id], expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice', expectedAccountCreatedAt: Date.parse(state.user.metadata.creationTime) });
  expect(JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } })).toBe(before);
});
it.each([{ ownerUid: 'bob' }, { profileId: 'bob' }, { accountCreatedAt: 1 }, { leaseUntil: 17000 }, { leaseUntil: 1000 },
  { ageReviewRequired: true }, { profiles: [profile, profile] }, { profiles: [{ ...profile, id: actor.profileId }] },
  { profiles: [{ ...profile, date_of_birth: '2001-01-01' }] }, { profiles: [{ ...profile, avatar_url: 'http://example.test/a.png' }] }])('rejects a contradictory or overbroad result %#', async patch => {
  state.call.mockResolvedValue({ data: receipt(patch), error: null });
  await expect(readPeopleDiscovery(actor, {}, guard)).rejects.toMatchObject({ code: 'invalid-response' });
});
it('enforces explicit empty selections and limit-bound candidates', async () => {
  await expect(readPeopleDiscovery(actor, { candidateIds: [] }, guard)).rejects.toMatchObject({ code: 'invalid-response' });
  await expect(readPeopleDiscovery(actor, { candidateIds: ['other', profile.id], limit: 1 }, guard)).rejects.toMatchObject({ code: 'invalid-response' });
  state.call.mockResolvedValue({ data: receipt({ ageReviewRequired: true, profiles: [] }), error: null });
  await expect(readPeopleDiscovery(actor, {}, guard)).resolves.toMatchObject({ ageReviewRequired: true, profiles: [] });
});
it('keeps unavailable failures actionable without a raw fallback', async () => {
  state.call.mockResolvedValue({ data: null, error: { name: 'unavailable', message: 'Try again' } });
  await expect(readPeopleDiscovery(actor, {}, guard)).rejects.toThrow('Try again'); expect(state.call).toHaveBeenCalledOnce();
});
it('rejects delayed A→B→A replies and a replaced SDK user object', async () => {
  let release!: (value: object) => void;
  state.call.mockReturnValue(new Promise(resolve => { release = resolve; }));
  const request = readPeopleDiscovery(actor, {}, guard); const rejected = expect(request).rejects.toThrow('Account changed');
  state.epoch += 2; release({ data: receipt(), error: null }); await rejected;
  state.call.mockReturnValue(new Promise(resolve => { release = resolve; }));
  const replaced = readPeopleDiscovery(actor, {}, guard); const rejectedObject = expect(replaced).rejects.toThrow('ended');
  state.user = { ...state.user }; release({ data: receipt(), error: null }); await rejectedObject;
});
it('bounds hung requests and retires late replies', async () => {
  vi.useFakeTimers(); let release!: (value: object) => void;
  state.call.mockReturnValue(new Promise(resolve => { release = resolve; }));
  const request = readPeopleDiscovery(actor, {}, guard); const rejected = expect(request).rejects.toMatchObject({ code: 'deadline-exceeded' });
  await vi.advanceTimersByTimeAsync(15000); await rejected;
  release({ data: receipt(), error: null }); await Promise.resolve();
  state.call.mockResolvedValue({ data: receipt(), error: null });
  await expect(readPeopleDiscovery(actor, {}, guard)).resolves.toMatchObject({ profiles: [profile] });
});
it('subtracts transport time independently from the server clock', async () => {
  const time = vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(1100);
  try { const result = await readPeopleDiscovery(actor, {}, guard); expect(result.validUntil - Date.now()).toBeLessThanOrEqual(14000); }
  finally { time.mockRestore(); }
});
