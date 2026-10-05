import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTimeout as realDelay } from 'node:timers/promises';
const state = vi.hoisted(() => ({ call: vi.fn(), epoch: 1, user: { uid: 'alice', metadata: { creationTime: '2026-01-01T00:00:00Z' } } }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: (...args: unknown[]) => state.call(...args) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => ({ currentUser: state.user }) }));
vi.mock('@/lib/profileAccountGuard', () => ({ profileAccountGuard: (uid: string, extra: () => void) => { const epoch = state.epoch; return () => { extra(); if (state.epoch !== epoch || state.user.uid !== uid) throw new Error('Account changed'); }; } }));
vi.mock('@/lib/postMediaUrl', () => ({ validPostMediaUrl: (url: string) => url.startsWith('https://') }));
import { manageMapPin, readMapPin, snapMapPinArea, type MapPinReceipt } from './mapPinService';
const actor = { uid: 'alice', profileId: 'profile-alice' }, rev = 'a'.repeat(48), sourceRev = 'b'.repeat(48), pinId = 'c'.repeat(64), noop = () => {};
let sourceId = '';
const share = () => ({ action: 'share' as const, kind: 'post' as const, sourceId, expectedRevision: null, expectedSourceRevision: sourceRev, area: { latitude: 41.89, longitude: -87.63, label: 'Park area' } });
function pin() { return { id: pinId, sourceId, kind: 'post', sourceType: 'post', revision: rev, publicationRevision: sourceRev, userId: actor.profileId, caption: 'Post', mediaUrl: null, thumbnailUrl: null, ...snapMapPinArea(41.89, -87.63), precision: 'approximate', radiusMeters: 2000, areaLabel: 'Park area', sharedAt: '2026-01-01T00:00:00.000Z', author: { id: actor.profileId, username: 'alice', displayName: null, avatarUrl: null } }; }
function response(input: Record<string, unknown>, patch: object = {}) {
  const now = Date.now();
  const base = { ok: true, action: input.action, ownerUid: input.expectedOwnerUid, profileId: input.expectedProfileId, accountCreatedAt: input.expectedAccountCreatedAt, serverTime: now, validUntil: now + 15_000 };
  if (input.action === 'list') return { ...base, kind: input.kind, items: [pin()], nextCursor: null, ...patch };
  if (input.action === 'read') return { ...base, pinId: input.pinId, pin: pin(), ...patch };
  return { ...base, kind: input.kind, sourceId: input.sourceId, status: 'shared', revision: rev, sourceRevision: sourceRev, canShare: true, pin: pin(), requestId: input.requestId, applied: true, replayed: false, ...patch };
}
function held<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { vi.clearAllMocks(); state.epoch++; sourceId = `post-${state.epoch}`; state.user = { uid: 'alice', metadata: { creationTime: '2026-01-01T00:00:00Z' } }; sessionStorage.clear(); state.call.mockImplementation(async (_name, input) => ({ data: response(input), error: null })); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('checked map pin transport', () => {
  it('binds explicit source/area to actor, incarnation, reviewed publication and stable request', async () => {
    const result = await manageMapPin(actor, share(), noop) as MapPinReceipt;
    expect(state.call).toHaveBeenCalledWith('manageMapPin', { ...share(), expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId, expectedAccountCreatedAt: Date.parse(state.user.metadata.creationTime), requestId: expect.any(String) });
    expect(result.applied).toBe(true); result.acknowledge(); expect(sessionStorage.getItem('vybe:map-pin-attempts:v1')).toBe('{}');
  });
  it.each([{ ok: false }, { ownerUid: 'bob' }, { profileId: 'alice' }, { sourceId: 'other' }, { kind: 'clip' }, { accountCreatedAt: 1 }, { requestId: crypto.randomUUID() }, { revision: null }, { status: 'removed' }, { sourceRevision: null }])('refuses contradictory receipt %#', async patch => {
    state.call.mockImplementation(async (_name, input) => ({ data: response(input, patch), error: null }));
    await expect(manageMapPin(actor, share(), noop)).rejects.toThrow('could not be confirmed');
  });
  it('matches real author bounds and rejects looping cursors and wrong read IDs', async () => {
    state.call.mockImplementation(async (_name, input) => ({ data: response(input, { items: [{ ...pin(), author: { ...pin().author, username: 'x'.repeat(100), displayName: 'y'.repeat(200) } }] }), error: null }));
    await expect(manageMapPin(actor, { action: 'list', kind: 'post' }, noop)).resolves.toMatchObject({ items: [expect.any(Object)] });
    state.call.mockImplementation(async (_name, input) => ({ data: response(input, { nextCursor: rev }), error: null }));
    await expect(manageMapPin(actor, { action: 'list', kind: 'post', cursor: rev }, noop)).rejects.toThrow('could not be confirmed');
    state.call.mockImplementation(async (_name, input) => ({ data: response(input, { pin: { ...pin(), id: 'd'.repeat(64) } }), error: null }));
    await expect(readMapPin(actor, pinId, noop)).rejects.toThrow('could not be confirmed');
  });
  it('retains exact retry across reload without persisting coordinates, labels or source IDs', async () => {
    state.call.mockResolvedValue({ data: null, error: { name: 'unavailable', message: 'Offline' } });
    await expect(manageMapPin(actor, share(), noop)).rejects.toThrow('Offline'); const first = state.call.mock.lastCall![1].requestId;
    const stored = sessionStorage.getItem('vybe:map-pin-attempts:v1')!;
    for (const privateValue of [sourceId, 'Park area', '41.89', 'alice', '-87.63']) expect(stored).not.toContain(privateValue);
    vi.resetModules(); const reloaded = await import('./mapPinService');
    await expect(reloaded.manageMapPin(actor, share(), noop)).rejects.toThrow('Offline'); expect(state.call.mock.lastCall![1].requestId).toBe(first);
  });
  it('keeps hidden acknowledgement retryable and protects a newer attempt from old acknowledgement', async () => {
    let visible = true; const first = await manageMapPin(actor, share(), () => { if (!visible) throw new Error('Hidden'); }) as MapPinReceipt;
    visible = false; expect(first.acknowledge).toThrow('Hidden'); visible = true;
    const retry = await manageMapPin(actor, share(), noop) as MapPinReceipt; expect(retry.requestId).toBe(first.requestId); retry.acknowledge();
    const newer = await manageMapPin(actor, share(), noop) as MapPinReceipt; first.acknowledge();
    expect((await manageMapPin(actor, share(), noop) as MapPinReceipt).requestId).toBe(newer.requestId);
  });
  it('accepts superseded replay without claiming the previous area is applied', async () => {
    state.call.mockImplementation(async (_name, input) => ({ data: response(input, { applied: false, replayed: true, status: 'removed', pin: null }), error: null }));
    const receipt = await manageMapPin(actor, share(), noop) as MapPinReceipt; expect(receipt.applied).toBe(false); expect(receipt.status).toBe('removed');
  });
  it('subtracts round-trip time independently from server clock and refuses exhausted leases', async () => {
    const serverTime = Date.now() - 86400_000;
    state.call.mockImplementation(async (_name, input) => ({ data: response(input, { serverTime, validUntil: serverTime + 15_000 }), error: null }));
    vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValue(600);
    const receipt = await manageMapPin(actor, { action: 'state', kind: 'post', sourceId }, noop); expect(receipt.validUntil).toBeLessThanOrEqual(Date.now() + 14_500); expect(receipt.validUntil).toBeGreaterThan(Date.now() + 14_000);
    vi.restoreAllMocks(); vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(16_000);
    await expect(manageMapPin(actor, { action: 'state', kind: 'post', sourceId }, noop)).rejects.toThrow('expired');
  });
  it('retires account ABA and deep-snapshots reviewed coordinates before delayed dispatch', async () => {
    const late = held<unknown>(); state.call.mockReturnValue(late.promise); const input = share();
    const task = manageMapPin(actor, input, noop), assertion = expect(task).rejects.toThrow('Account changed'); input.area.label = 'Changed later';
    for (let i = 0; i < 400 && !state.call.mock.calls.length; i++) await realDelay(5);
    expect(state.call.mock.lastCall![1].area.label).toBe('Park area'); state.epoch += 2;
    late.resolve({ data: response(state.call.mock.lastCall![1]), error: null }); await assertion;
  });
  it('bounds a hung request and retains retry identity after its late response', async () => {
    vi.useFakeTimers(); const late = held<unknown>(); state.call.mockReturnValue(late.promise);
    const task = manageMapPin(actor, share(), noop), assertion = expect(task).rejects.toThrow('too long');
    for (let i = 0; i < 400 && !state.call.mock.calls.length; i++) await realDelay(5);
    expect(state.call).toHaveBeenCalledOnce(); const first = state.call.mock.lastCall![1].requestId;
    await vi.advanceTimersByTimeAsync(15_000); await assertion; late.resolve({ data: response(state.call.mock.lastCall![1]), error: null }); await Promise.resolve();
    vi.useRealTimers(); state.call.mockResolvedValue({ data: null, error: { name: 'unavailable', message: 'Offline' } });
    await expect(manageMapPin(actor, share(), noop)).rejects.toThrow('Offline'); expect(state.call.mock.lastCall![1].requestId).toBe(first);
  });
});
