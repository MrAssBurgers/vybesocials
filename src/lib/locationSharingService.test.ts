import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
import { checkedLocationRead, locationAttempt, locationSharingRequest } from './locationSharingService';
import { grant, locationRead, locationRequest, revision } from '@/test/locationSharingFixtures';
const actor = { uid: 'uid-alice', profileId: 'alice' };
const input = { action: 'request' as const, targetId: 'bob', duration: '1h' as const, precision: 'approximate' as const, message: null };
beforeEach(() => { state.invoke.mockReset(); sessionStorage.clear(); });
describe('checked location-sharing service', () => {
  it('binds actor, action, request identity and exact target receipt', async () => {
    const body = { ...input, requestId: crypto.randomUUID() };
    state.invoke.mockResolvedValue({ data: { ok: true, ownerUid: actor.uid, profileId: actor.profileId, action: 'request', requestId: body.requestId, serverTime: Date.now(), request: locationRequest() }, error: null });
    await expect(locationSharingRequest(actor, body, () => {})).resolves.toHaveProperty('request.targetId', 'bob');
    expect(state.invoke).toHaveBeenCalledWith('manage-location-sharing', { ...body, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId });
    state.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(locationSharingRequest(actor, body, () => {})).rejects.toThrow('not confirmed');
  });
  it.each(['no-grant', 'wrong-viewer', 'wrong-precision', 'wrong-target'])('rejects an accepted request with %s', async fault => {
    const incoming = locationRequest({ requesterId: 'bob', targetId: 'alice', requester: { id: 'bob', username: 'Bob', displayName: null, avatarUrl: null }, target: { id: 'alice', username: 'Alice', displayName: null, avatarUrl: null }, status: 'accepted', shareId: 'b'.repeat(64) });
    const accepted = grant({ sharerId: 'alice', viewerId: 'bob' });
    if (fault === 'wrong-viewer') accepted.viewerId = 'carol';
    if (fault === 'wrong-precision') accepted.precision = 'precise';
    if (fault === 'wrong-target') incoming.targetId = 'carol';
    const body = { action: 'respond' as const, locationRequestId: incoming.id, expectedRevision: revision, intent: 'accept' as const, requestId: crypto.randomUUID() };
    state.invoke.mockResolvedValue({ data: { ok: true, ownerUid: actor.uid, profileId: actor.profileId, action: 'respond', requestId: body.requestId, serverTime: Date.now(), request: incoming, share: fault === 'no-grant' ? null : accepted }, error: null });
    await expect(locationSharingRequest(actor, body, () => {})).rejects.toThrow('not confirmed');
  });
  it('does not accept enabled state without a protected revision or contradictory profile identity', () => {
    expect(() => checkedLocationRead(locationRead({ state: { enabled: true, revision: null, updatedAt: null } }), actor)).toThrow('not confirmed');
    const data = locationRead(); Object.assign(data.locations[0].profile, { id: 'carol' });
    expect(() => checkedLocationRead(data, actor)).toThrow('not confirmed');
  });
  it('does not consume an old-account response after an await', async () => {
    let current = true;
    state.invoke.mockImplementation(async () => { current = false; return { data: {}, error: null }; });
    await expect(locationSharingRequest(actor, { action: 'read' }, () => { if (!current) throw new Error('account changed'); })).rejects.toThrow('account changed');
  });
  it.each(['foreign', 'paused', 'precise-speed', 'missing-grant'])('rejects malformed admission %s', kind => {
    const data = locationRead();
    if (kind === 'foreign') data.shares[0].viewerId = 'other';
    if (kind === 'paused') data.shares[0].paused = true;
    if (kind === 'precise-speed') data.locations[0].speed = 8;
    if (kind === 'missing-grant') data.shares = [];
    expect(() => checkedLocationRead(data, actor)).toThrow('not confirmed');
  });
  it('accepts server-projected approximate coordinates, never adds precision', () => {
    const data = locationRead(); expect(checkedLocationRead(data, actor).locations[0]).toEqual(data.locations[0]);
  });
  it('retains the exact uncertain revision and request ID until confirmation', () => {
    const first = locationAttempt(actor, { action: 'setSharing', expectedRevision: revision, enabled: false });
    const retry = locationAttempt(actor, { action: 'setSharing', expectedRevision: 'd'.repeat(48), enabled: false });
    expect(retry.body).toEqual(first.body); first.complete();
    const next = locationAttempt(actor, { action: 'setSharing', expectedRevision: 'd'.repeat(48), enabled: false });
    expect(next.body.requestId).not.toBe(first.body.requestId); next.complete();
  });
  it('does not persist coordinates in retry storage', () => {
    locationAttempt(actor, { action: 'publishPosition', sharingRevision: revision, sampledAt: Date.now(), latitude: 12.1234567, longitude: 45.9876543, accuracy: 5, speed: null, heading: null, batteryPercent: null, activityType: 'stationary' });
    expect(sessionStorage.getItem('vybe-location-attempts-v1')).toBeNull();
  });
});
