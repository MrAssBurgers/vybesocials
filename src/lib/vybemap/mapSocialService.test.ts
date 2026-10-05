import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const call = vi.hoisted(() => vi.fn());
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: call }));
import { mapSocialAttempt, mapSocialRequest } from './mapSocialService';
const actor = { uid: 'alice', profileId: 'profile-alice' };
const guard = vi.fn();
const now = 1791170000000;
const spot = { id: 'spot', created_by: 'profile-alice', name: 'Park', category: 'chill', latitude: 40, longitude: -90, check_in_count: 0, legacy: false, revision: 'a'.repeat(48) };
const page = () => ({ ok: true, ownerUid: 'alice', profileId: 'profile-alice', action: 'list', scope: 'places', targetId: null, items: [spot], nextCursor: null, serverTime: now, validUntil: now + 15_000 });
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); call.mockResolvedValue({ data: page(), error: null }); });
afterEach(() => vi.useRealTimers());
describe('checked map transport', () => {
  it('accepts an admitted page and translates its server lease to the local clock', async () => {
    const response = await mapSocialRequest(actor, { action: 'list', scope: 'places' }, guard);
    expect(response).toMatchObject({ items: [spot], nextCursor: null });
    expect(response.validUntil).toBeGreaterThan(Date.now());
    expect(response.validUntil).toBeLessThanOrEqual(Date.now() + 15_000);
  });
  it.each([
    { ownerUid: 'bob' }, { profileId: 'profile-bob' }, { scope: 'meetups' }, { targetId: 'wrong' },
    { validUntil: now + 90_000 }, { items: [{ ...spot, latitude: 95 }] }, { items: [{ ...spot, check_in_count: -1 }] },
    { items: [{ ...spot, revision: undefined }] }, { ok: false },
  ])('rejects unconfirmed or mismatched page evidence %#', async patch => {
    call.mockResolvedValue({ data: { ...page(), ...patch }, error: null });
    await expect(mapSocialRequest(actor, { action: 'list', scope: 'places' }, guard)).rejects.toThrow('could not be confirmed');
  });
  it('does not resolve a response after its account retired', async () => {
    let active = true;
    call.mockImplementation(async () => { active = false; return { data: page(), error: null }; });
    await expect(mapSocialRequest(actor, { action: 'list', scope: 'places' }, () => { if (!active) throw new Error('retired'); })).rejects.toThrow('retired');
  });
  it.each(['', 'previous-cursor'])('rejects a continuation that cannot advance: %s', async nextCursor => {
    call.mockResolvedValue({ data: { ...page(), nextCursor }, error: null });
    await expect(mapSocialRequest(actor, { action: 'list', scope: 'places', cursor: 'previous-cursor' }, guard)).rejects.toThrow('could not be confirmed');
  });
  it('rejects a reply for a different parent post', async () => {
    const input = { action: 'createComment' as const, postId: 'wanted', content: 'Hello', requestId: crypto.randomUUID() };
    call.mockResolvedValue({ data: { ...page(), action: input.action, requestId: input.requestId, resourceId: 'comment', status: 'active', item: { id: 'comment', post_id: 'wrong', user_id: actor.profileId, content: input.content, created_at: new Date(now).toISOString() } }, error: null });
    await expect(mapSocialRequest(actor, input, guard)).rejects.toThrow('could not be confirmed');
  });
  it('accepts a confirmed leave without returning revoked meetup details', async () => {
    const input = { action: 'leaveMeetup' as const, meetupId: 'meetup', expectedRevision: 'a'.repeat(48), requestId: crypto.randomUUID() };
    call.mockResolvedValue({ data: { ...page(), action: input.action, requestId: input.requestId, resourceId: 'meetup', status: 'left', item: null }, error: null });
    await expect(mapSocialRequest(actor, input, guard)).resolves.toMatchObject({ item: null, status: 'left' });
  });
  it('bounds a request that never settles', async () => {
    vi.useFakeTimers(); call.mockReturnValue(new Promise(() => {}));
    const result = expect(mapSocialRequest(actor, { action: 'list', scope: 'places' }, guard)).rejects.toThrow('took too long');
    await vi.advanceTimersByTimeAsync(15_000); await result;
  });
});

describe('map retry identity', () => {
  it('preserves an unconfirmed exact request without storing private coordinates or text', async () => {
    const input = { action: 'createMeetup' as const, title: `Private draft ${crypto.randomUUID()}`, latitude: 42.123456, longitude: -93.765432 };
    const first = await mapSocialAttempt(actor, input), second = await mapSocialAttempt(actor, input);
    expect(second.body.requestId).toBe(first.body.requestId);
    const stored = sessionStorage.getItem('vybe-map-social-attempts-v1');
    expect(stored).not.toContain('42.123456'); expect(stored).not.toContain(input.title); expect(stored).not.toContain('profile-alice');
    expect((await mapSocialAttempt({ uid: 'bob', profileId: 'profile-bob' }, input)).body.requestId).not.toBe(first.body.requestId);
    first.complete(); expect((await mapSocialAttempt(actor, input)).body.requestId).not.toBe(first.body.requestId);
  });
  it('binds an RSVP retry to its original membership revision', async () => {
    const input = { action: 'joinMeetup' as const, meetupId: crypto.randomUUID(), expectedRevision: null };
    const first = await mapSocialAttempt(actor, input);
    expect((await mapSocialAttempt(actor, { ...input, expectedRevision: 'b'.repeat(48) })).body.requestId).not.toBe(first.body.requestId);
  });
});
