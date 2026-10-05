import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ invoke: vi.fn(), uid: 'alice', epoch: 1 }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => ({ uid: state.uid, epoch: state.epoch }) }));
import { fetchLocationIntel } from './locationIntel';
const actor = { uid: 'alice', profileId: 'profile-alice' }, input = { latitude: 40, longitude: -80, placeName: 'Park' };
const intel = () => ({ cache_key: 'a'.repeat(64), latitude: 40, longitude: -80, place_name: 'Park', safety_score: 50, verdict: 'caution',
  labels: [{ type: 'water_hazard', title: 'Water', detail: 'Check the shore', severity: 'warning' }], summary: 'Area details', tips: ['Check locally'],
  researched_at: new Date(Date.now() - 1000).toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() });
const receipt = (extra = {}) => ({ ok: true, ownerUid: 'alice', profileId: 'profile-alice', serverTime: Date.now(), validUntil: Date.now() + 15000, placeId: null, intel: intel(), ...extra });
beforeEach(() => { state.uid = 'alice'; state.epoch++; state.invoke.mockReset().mockResolvedValue({ data: receipt(), error: null }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('checked location intelligence', () => {
  it('binds draft research to actor and exact coordinates', async () => {
    expect((await fetchLocationIntel(actor, input, () => {})).intel.summary).toBe('Area details');
    expect(state.invoke).toHaveBeenCalledWith('research-map-location', { expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId, ...input });
  });
  it('lets the server derive published-place coordinates and requires the matching place receipt', async () => {
    state.invoke.mockResolvedValue({ data: receipt({ placeId: 'spot', intel: { ...intel(), latitude: 41 } }), error: null });
    expect((await fetchLocationIntel(actor, { ...input, placeId: 'spot', forceRefresh: true }, () => {})).intel.latitude).toBe(41);
    expect(state.invoke).toHaveBeenCalledWith('research-map-location', { expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId, placeId: 'spot', forceRefresh: true });
  });
  it.each([{ ownerUid: 'bob' }, { profileId: 'foreign' }, { placeId: 'other' }, { validUntil: Number.MAX_SAFE_INTEGER },
    { intel: { ...intel(), latitude: 42 } }, { intel: { ...intel(), labels: [null] } }, { intel: { ...intel(), safety_score: NaN } },
    { intel: { ...intel(), verdict: 'certainly-safe' } }, { intel: { ...intel(), cache_key: 'global-cache' } }])('rejects incomplete/mismatched evidence %j', async extra => {
    state.invoke.mockResolvedValue({ data: receipt(extra), error: null });
    await expect(fetchLocationIntel(actor, input, () => {})).rejects.toThrow('confirmed');
  });
  it('propagates failure rather than returning an empty successful result', async () => {
    state.invoke.mockResolvedValue({ data: null, error: { code: 'permission-denied', message: 'This spot is unavailable' } });
    await expect(fetchLocationIntel(actor, input, () => {})).rejects.toMatchObject({ message: 'This spot is unavailable', code: 'permission-denied' });
  });
  it('subtracts round-trip duration from the access lease', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(5000);
    const before = Date.now(), result = await fetchLocationIntel(actor, input, () => {});
    expect(result.validUntil).toBeGreaterThanOrEqual(before + 10900); expect(result.validUntil).toBeLessThanOrEqual(before + 11100); clock.mockRestore();
  });
  it('rejects late account ABA and closed-view receipts', async () => {
    let resolve!: (value: unknown) => void;
    state.invoke.mockImplementation(() => new Promise(r => { resolve = r; }));
    const pending = fetchLocationIntel(actor, input, () => {}), rejection = expect(pending).rejects.toThrow('account changed');
    state.epoch += 2; resolve({ data: receipt(), error: null }); await rejection;
    let active = true;
    const next = fetchLocationIntel(actor, input, () => { if (!active) throw new Error('View closed'); }), rejected = expect(next).rejects.toThrow('View closed');
    active = false; resolve({ data: receipt(), error: null }); await rejected;
  });
  it('bounds a hanging request and never accepts its late result', async () => {
    vi.useFakeTimers(); let resolve!: (value: unknown) => void;
    state.invoke.mockImplementation(() => new Promise(r => { resolve = r; }));
    const request = fetchLocationIntel(actor, input, () => {}), rejection = expect(request).rejects.toThrow('too long');
    await vi.advanceTimersByTimeAsync(15000); await rejection; resolve({ data: receipt(), error: null }); await Promise.resolve();
  });
});
