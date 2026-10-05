import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { streakReceipt } from '@/test/loginStreakFixture';
const state = vi.hoisted(() => ({ invoke: vi.fn(), session: { uid: 'alice', epoch: 1 }, user: { uid: 'alice', metadata: { creationTime: new Date(1700000000000).toUTCString() } } }));
vi.mock('./firebase/authService', () => ({ getFirebaseAuth: () => ({ currentUser: state.user }) }));
vi.mock('./firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('./reportModerationService', () => ({ reportAccountSnapshot: () => state.session }));
const actor = { uid: 'alice', profileId: 'profile-alice' };
const reply = (request: any, overrides = {}) => ({ data: streakReceipt({ action: request.action, requestId: request.requestId ?? null, restored: request.action === 'restore', ...overrides }), error: null });
async function service() { return (await import('./loginStreakService')).manageLoginStreak; }
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); sessionStorage.clear(); state.session = { uid: 'alice', epoch: state.session.epoch + 1 }; state.user = { uid: 'alice', metadata: { creationTime: new Date(1700000000000).toUTCString() } }; state.invoke.mockImplementation((_name, request) => Promise.resolve(reply(request))); });
afterEach(() => vi.useRealTimers());
describe('checked login streak transport', () => {
  it('binds checked reads to native account incarnation and canonical profile without browser counters', async () => {
    const run = await service(); expect(await run(actor, 'read', { timezone: 'UTC' })).toMatchObject({ streak: 1 });
    expect(state.invoke).toHaveBeenCalledWith('manageLoginStreak', { action: 'read', expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice', expectedAccountCreatedAt: 1700000000000, timezone: 'UTC' });
  });
  it.each([{ ownerUid: 'bob' }, { profileId: 'other' }, { accountCreatedAt: 1 }, { streak: -1 }, { longestStreak: 0 }, { requestId: 'wrong' }, { currentStreakVerified: undefined }, { restore: { eligible: true, previousStreak: null, availableUntil: null, reason: 'available', access: 'none' } }])('rejects mismatched or incomplete receipts %j', async overrides => {
    state.invoke.mockImplementation((_name, request) => Promise.resolve(reply(request, overrides)));
    await expect((await service())(actor, 'read')).rejects.toThrow('confirmation');
  });
  it('keeps exact restore request through lost response and same-tab module reload, then retires it on success', async () => {
    state.invoke.mockResolvedValueOnce({ data: null, error: { name: 'unavailable', message: 'Lost response' } });
    let run = await service(); await expect(run(actor, 'restore', { expectedRevision: 'b'.repeat(48), timezone: 'UTC' })).rejects.toMatchObject({ name: 'unavailable' });
    const first = state.invoke.mock.calls[0][1]; vi.resetModules(); run = await service();
    await run(actor, 'restore', { expectedRevision: 'b'.repeat(48), timezone: 'UTC' });
    expect(state.invoke.mock.calls[1][1]).toEqual(first);
    await run(actor, 'restore', { expectedRevision: 'b'.repeat(48), timezone: 'UTC' });
    expect(state.invoke.mock.calls[2][1].requestId).not.toBe(first.requestId);
  });
  it('retires a server-confirmed stale attempt so a fresh deliberate retry can recover', async () => {
    state.invoke.mockResolvedValueOnce({ data: null, error: { name: 'aborted', message: 'Changed' } });
    const run = await service(); await expect(run(actor, 'track')).rejects.toMatchObject({ name: 'aborted' }); await run(actor, 'track');
    expect(state.invoke.mock.calls[1][1].requestId).not.toBe(state.invoke.mock.calls[0][1].requestId);
  });
  it('rejects restore false-success and retains the uncertain request', async () => {
    state.invoke.mockImplementationOnce((_name, request) => Promise.resolve(reply(request, { restored: false })));
    const run = await service(); await expect(run(actor, 'restore', { expectedRevision: 'b'.repeat(48) })).rejects.toThrow('confirmation');
    await run(actor, 'restore', { expectedRevision: 'b'.repeat(48) }); expect(state.invoke.mock.calls[1][1]).toEqual(state.invoke.mock.calls[0][1]);
  });
  it('ignores late account ABA receipts and does not retire the uncertain request', async () => {
    let resolve!: (value: any) => void; state.invoke.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const pending = (await service())(actor, 'track'); const rejected = expect(pending).rejects.toThrow('account changed');
    state.session = { uid: 'alice', epoch: state.session.epoch + 2 }; resolve(reply(state.invoke.mock.calls[0][1])); await rejected;
    expect(JSON.parse(sessionStorage.getItem('vybe:login-streak-attempts:v1') || '[]')).toHaveLength(1);
  });
  it('bounds a hung request and retries the same server attempt without accepting late success', async () => {
    vi.useFakeTimers(); let resolve!: (value: any) => void; state.invoke.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const run = await service(); const pending = run(actor, 'track'); const rejected = expect(pending).rejects.toThrow('too long');
    await vi.advanceTimersByTimeAsync(15000); await rejected; resolve(reply(state.invoke.mock.calls[0][1])); await Promise.resolve();
    await run(actor, 'track'); expect(state.invoke.mock.calls[1][1]).toEqual(state.invoke.mock.calls[0][1]);
  });
});
