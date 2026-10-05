import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTimeout as realDelay } from 'node:timers/promises';
const state = vi.hoisted(() => ({ call: vi.fn(), epoch: 1, user: { uid: 'alice', metadata: { creationTime: '2026-01-01T00:00:00Z' } } }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: (...args: unknown[]) => state.call(...args) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => ({ currentUser: state.user }) }));
vi.mock('@/lib/profileAccountGuard', () => ({ profileAccountGuard: (uid: string, extra: () => void) => { const epoch = state.epoch; return () => { extra(); if (state.epoch !== epoch || state.user.uid !== uid) throw new Error('Account changed'); }; } }));
import { sendCheckedMapWave } from './mapWaveService';
const actor = { uid: 'alice', profileId: 'profile-alice' }, target = { targetProfileId: 'profile-bob', expectedAccessRevision: 'a'.repeat(48) };
const noop = () => {};
const notificationId = `map-wave-${'e'.repeat(64)}`;
function response(input: Record<string, unknown>, extra: object = {}) {
  const now = Date.now();
  return { ok: true, action: 'send', ownerUid: input.expectedOwnerUid, profileId: input.expectedProfileId, accountCreatedAt: input.expectedAccountCreatedAt, targetProfileId: input.targetProfileId, requestId: input.requestId, accessRevision: input.expectedAccessRevision, status: 'sent', notificationId, sentAt: now, cooldownUntil: now + 60_000, serverTime: now, validUntil: now + 15_000, replayed: false, ...extra };
}
function held<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { vi.clearAllMocks(); state.epoch++; state.user = { uid: 'alice', metadata: { creationTime: '2026-01-01T00:00:00Z' } }; sessionStorage.clear(); state.call.mockImplementation(async (_name, input) => ({ data: response(input), error: null })); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('checked map waves', () => {
  it('sends canonical account, incarnation, selected target and grant, never names or coordinates', async () => {
    const receipt = await sendCheckedMapWave(actor, target, noop); receipt.acknowledge();
    expect(state.call).toHaveBeenCalledWith('manageMapWave', { action: 'send', expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId, expectedAccountCreatedAt: Date.parse(state.user.metadata.creationTime), ...target, requestId: expect.any(String) });
    expect(receipt.notificationId).toBe(notificationId);
  });
  it.each([{ ok: false }, { ownerUid: 'bob' }, { profileId: 'alice' }, { targetProfileId: 'profile-carol' }, { accountCreatedAt: 1 }, { accessRevision: 'b'.repeat(48) }, { requestId: crypto.randomUUID() }, { status: 'cooldown' }, { cooldownUntil: 1 }, { notificationId: 'bad/path' }, { notificationId: 'notification-one' }])('rejects a contradictory receipt %#', async patch => {
    state.call.mockImplementation(async (_name, input) => ({ data: response(input, patch), error: null }));
    await expect(sendCheckedMapWave(actor, target, noop)).rejects.toThrow('could not be confirmed');
  });
  it('retains exact uncertain requests across reload and only persists hash plus UUID', async () => {
    state.call.mockResolvedValue({ data: null, error: { name: 'unavailable', message: 'Offline' } });
    await expect(sendCheckedMapWave(actor, target, noop)).rejects.toThrow('Offline');
    const first = state.call.mock.calls[0][1].requestId, saved = sessionStorage.getItem('vybe:map-wave-attempts:v1')!;
    expect(saved).not.toContain('alice'); expect(saved).not.toContain('bob'); expect(saved).not.toContain(target.expectedAccessRevision);
    vi.resetModules(); const fresh = await import('./mapWaveService');
    await expect(fresh.sendCheckedMapWave(actor, target, noop)).rejects.toThrow('Offline');
    expect(state.call.mock.calls[1][1].requestId).toBe(first);
    await expect(fresh.sendCheckedMapWave(actor, { ...target, expectedAccessRevision: 'c'.repeat(48) }, noop)).rejects.toThrow('Offline');
    expect(state.call.mock.calls[2][1].requestId).not.toBe(first);
  });
  it('keeps a hidden confirmation retryable until the visible consumer acknowledges', async () => {
    let visible = true;
    const receipt = await sendCheckedMapWave(actor, target, () => { if (!visible) throw new Error('Hidden'); });
    const first = state.call.mock.calls[0][1].requestId; visible = false;
    expect(() => receipt.acknowledge()).toThrow('Hidden');
    const retry = await sendCheckedMapWave(actor, target, noop);
    expect(state.call.mock.calls[1][1].requestId).toBe(first); retry.acknowledge();
    await sendCheckedMapWave(actor, target, noop); expect(state.call.mock.calls[2][1].requestId).not.toBe(first);
  });
  it('converts server cooldown and admission with clock skew and round-trip time', async () => {
    const serverTime = Date.now() - 86_400_000;
    vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValue(350);
    state.call.mockImplementation(async (_name, input) => ({ data: response(input, { serverTime, sentAt: serverTime, cooldownUntil: serverTime + 60_000, validUntil: serverTime + 15_000 }), error: null }));
    const receipt = await sendCheckedMapWave(actor, target, noop);
    expect(receipt.cooldownUntil).toBeLessThanOrEqual(Date.now() + 59_750); expect(receipt.cooldownUntil).toBeGreaterThan(Date.now() + 59_000);
    receipt.acknowledge();
  });
  it('accepts an older exact receipt without claiming another notification was created', async () => {
    state.call.mockImplementation(async (_name, input) => { const now = Date.now(); return { data: response(input, { sentAt: now - 70_000, cooldownUntil: now - 10_000, replayed: true }), error: null }; });
    const receipt = await sendCheckedMapWave(actor, target, noop); expect(receipt.replayed).toBe(true); expect(receipt.cooldownUntil).toBeLessThanOrEqual(Date.now());
  });
  it('surfaces server cooldown separately from success and clears a confirmed rejected attempt', async () => {
    const now = Date.now(); state.call.mockResolvedValue({ data: null, error: { name: 'resource-exhausted', message: 'Wait', details: { serverTime: now, cooldownUntil: now + 30_000 } } });
    await expect(sendCheckedMapWave(actor, target, noop)).rejects.toMatchObject({ cooldownUntil: expect.any(Number) });
    const first = state.call.mock.calls[0][1].requestId;
    await expect(sendCheckedMapWave(actor, target, noop)).rejects.toThrow('wait'); expect(state.call.mock.calls[1][1].requestId).not.toBe(first);
  });
  it('preserves uncertain retry identity through outer rate limits and temporary denial', async () => {
    state.call.mockResolvedValue({ data: null, error: { name: 'unavailable', message: 'Offline' } });
    await expect(sendCheckedMapWave(actor, target, noop)).rejects.toThrow('Offline');
    const first = state.call.mock.calls[0][1].requestId;
    for (const name of ['resource-exhausted', 'permission-denied']) {
      state.call.mockResolvedValue({ data: null, error: { name, message: 'Retry later' } });
      await expect(sendCheckedMapWave(actor, target, noop)).rejects.toThrow('Retry later');
      expect(state.call.mock.lastCall![1].requestId).toBe(first);
    }
  });
  it('does not let an older acknowledgement erase a newer retained attempt', async () => {
    const old = await sendCheckedMapWave(actor, target, noop); old.acknowledge();
    await sendCheckedMapWave(actor, target, noop); const newer = state.call.mock.lastCall![1].requestId;
    old.acknowledge();
    await sendCheckedMapWave(actor, target, noop); expect(state.call.mock.lastCall![1].requestId).toBe(newer);
  });
  it('rejects expired receipt admission and late account ABA results', async () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(16_000);
    await expect(sendCheckedMapWave(actor, target, noop)).rejects.toThrow('expired'); vi.restoreAllMocks();
    const late = held<unknown>(); state.call.mockReturnValue(late.promise);
    const task = sendCheckedMapWave(actor, target, noop), assertion = expect(task).rejects.toThrow('Account changed');
    while (state.call.mock.calls.length < 2) await realDelay(2);
    state.epoch += 2; late.resolve({ data: response(state.call.mock.calls[1][1]), error: null }); await assertion;
  });
  it('bounds the entire operation and refuses a late completion without retiring its retry UUID', async () => {
    vi.useFakeTimers(); const late = held<unknown>(); state.call.mockReturnValue(late.promise);
    const task = sendCheckedMapWave(actor, target, noop), assertion = expect(task).rejects.toThrow('too long');
    // Native crypto runs outside fake timers; wait for actual dispatch before advancing the deadline.
    for (let i = 0; i < 400 && !state.call.mock.calls.length; i++) await realDelay(5);
    expect(state.call).toHaveBeenCalledOnce(); const first = state.call.mock.calls[0][1].requestId;
    await vi.advanceTimersByTimeAsync(15_000); await assertion;
    late.resolve({ data: response(state.call.mock.calls[0][1]), error: null }); await Promise.resolve();
    vi.useRealTimers(); state.call.mockResolvedValue({ data: null, error: { name: 'unavailable', message: 'Offline' } });
    await expect(sendCheckedMapWave(actor, target, noop)).rejects.toThrow('Offline'); expect(state.call.mock.calls[1][1].requestId).toBe(first);
  });
});
