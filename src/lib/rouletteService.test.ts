import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: h.invoke }));
import { rouletteRequest, validateRouletteReply, type RouletteRequest } from './rouletteService';
const request: RouletteRequest = { action: 'join', expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice', requestId: '10000000-0000-4000-8000-000000000001', mode: 'text', interests: ['Music'] };
const value = () => ({ ok: true, ownerUid: 'alice', profileId: 'profile-alice', requestId: request.requestId, searchId: request.requestId, state: 'searching', mode: 'text', interests: ['Music'], expiresAt: 12345, match: null });
const paired = () => ({ ...value(), state: 'matched', match: { id: 'pair-one', user_a: 'profile-alice', user_b: 'profile-bob', status: 'active', mode: 'text', shared_interests: ['Music'], started_at: '2026-11-15T00:00:00Z', conversation_id: null, call_starter_profile_id: null, partner: { id: 'profile-bob', username: 'bob', display_name: null, avatar_url: null } } });
beforeEach(() => { h.invoke.mockReset().mockResolvedValue({ data: value(), error: null }); });
it('requires a matching current owner/profile/operation receipt', () => {
  expect(validateRouletteReply(value(), request).state).toBe('searching');
  for (const patch of [{ ownerUid: 'bob' }, { profileId: 'profile-bob' }, { requestId: 'other' }, { searchId: '../other' }, { expiresAt: 0 }, { state: 'unknown' }, { interests: ['fabricated'] }, { mode: 'video' }]) expect(() => validateRouletteReply({ ...value(), ...patch }, request)).toThrow();
});
it('validates both actual participants and the minimal partner profile', () => {
  expect(validateRouletteReply(paired(), request).match?.partner.id).toBe('profile-bob');
  for (const patch of [{ user_a: 'profile-other' }, { user_b: 'profile-alice' }, { partner: { id: 'profile-eve', username: 'eve', display_name: null, avatar_url: null } }, { call_starter_profile_id: 'profile-eve' }, { conversation_id: '../other' }, { started_at: 'never' }]) expect(() => validateRouletteReply({ ...paired(), match: { ...paired().match, ...patch } }, request)).toThrow();
});
it('cannot claim Cancel/End succeeded while the receipt still reports an active match', () => {
  for (const action of ['cancel', 'end'] as const) expect(() => validateRouletteReply(paired(), { ...request, action })).toThrow();
});
it('requires the exact current match and a confirmed conversation before handoff', () => {
  const handoff = { ...request, action: 'handoff' as const, matchId: 'pair-one' };
  expect(() => validateRouletteReply(paired(), handoff)).toThrow();
  const valid = { ...paired(), match: { ...paired().match, conversation_id: 'roulette-pair-one' } };
  expect(validateRouletteReply(valid, handoff).match?.conversation_id).toBe('roulette-pair-one');
  expect(() => validateRouletteReply(valid, { ...handoff, matchId: 'foreign-pair' })).toThrow();
});
it('allows a current server-confirmed resumed mode and terminal cancellation tombstone', () => {
  expect(validateRouletteReply({ ...value(), resumed: true, mode: 'audio' }, request).mode).toBe('audio');
  expect(validateRouletteReply({ ...value(), state: 'idle', mode: 'text', expiresAt: 0 }, { ...request, mode: 'video' }).state).toBe('idle');
});
it('passes the owned token-dispatch guard and preserves transport failures', async () => {
  const guard = vi.fn(); await rouletteRequest(request, guard);
  expect(h.invoke).toHaveBeenCalledWith('find-roulette-match', request, { expectedOwnerUid: 'alice', guard }); expect(guard).toHaveBeenCalledTimes(2);
  h.invoke.mockResolvedValueOnce({ error: { code: 'unavailable', message: 'Disconnected' }, data: null });
  await expect(rouletteRequest(request, guard)).rejects.toMatchObject({ code: 'unavailable', message: 'Disconnected' });
});
it('does not dispatch a retired action or accept a retired response', async () => {
  const retired = () => { throw new Error('Account changed'); };
  await expect(rouletteRequest(request, retired)).rejects.toThrow('Account changed'); expect(h.invoke).not.toHaveBeenCalled();
  let active = true; h.invoke.mockImplementationOnce(async () => { active = false; return { data: value(), error: null }; });
  await expect(rouletteRequest(request, () => { if (!active) throw new Error('Account changed'); })).rejects.toThrow('Account changed');
});
