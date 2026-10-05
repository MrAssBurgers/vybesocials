import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { squadFixture, squadTime, squadDeferred } from '@/test/mapSquadFixture';
const state = vi.hoisted(() => ({ call: vi.fn(), epoch: 1, user: { uid: 'alice', metadata: { creationTime: '2026-01-01T00:00:00Z' } } }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: (...args: unknown[]) => state.call(...args) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => ({ currentUser: state.user }) }));
vi.mock('@/lib/profileAccountGuard', () => ({ profileAccountGuard: (uid: string, extra: () => void) => { const epoch = state.epoch; return () => { extra(); if (state.epoch !== epoch || state.user.uid !== uid) throw new Error('Account changed'); }; } }));
import { manageMapSquad, squadInviteToken } from './mapSquadService';
const actor = { uid: 'alice', profileId: 'profile-alice' }, guard = () => {};
const invitation = 'c'.repeat(64);
function response(input: Record<string, unknown>, extra: object = {}) { return { ok: true, ownerUid: actor.uid, profileId: actor.profileId, accountCreatedAt: Date.parse(state.user.metadata.creationTime), action: input.action, ...squadTime(), ...(input.requestId ? { requestId: input.requestId, squadId: 'squad-one', status: 'active', squad: squadFixture(), membership: squadFixture().membership } : { items: [squadFixture()], nextCursor: null }), ...extra }; }
beforeEach(() => { vi.clearAllMocks(); state.epoch++; sessionStorage.clear(); state.user = { uid: 'alice', metadata: { creationTime: '2026-01-01T00:00:00Z' } }; state.call.mockImplementation(async (_name, input) => ({ data: response(input), error: null })); });
afterEach(() => vi.useRealTimers());
describe('checked squad receipts and retries', () => {
  it('binds reads to canonical UID/profile and the current Auth incarnation', async () => {
    await expect(manageMapSquad(actor, { action: 'list' }, guard)).resolves.toMatchObject({ items: [squadFixture()] });
    expect(state.call).toHaveBeenCalledWith('manageMapSquad', { action: 'list', expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice', expectedAccountCreatedAt: Date.parse(state.user.metadata.creationTime) });
  });
  it.each([{ ownerUid: 'bob' }, { profileId: 'alice' }, { accountCreatedAt: 1 }, { ok: false }, { items: [squadFixture({ membership: null })] }])('rejects mismatched authority %#', async patch => {
    state.call.mockImplementation(async (_name, input) => ({ data: response(input, patch), error: null }));
    await expect(manageMapSquad(actor, { action: 'list' }, guard)).rejects.toThrow('could not be confirmed');
  });
  it('retains the same unknown join attempt across module reload without storing invite token or identity', async () => {
    state.call.mockResolvedValue({ data: null, error: { name: 'unavailable', message: 'Offline' } });
    await expect(manageMapSquad(actor, { action: 'join', token: invitation }, guard)).rejects.toThrow('Offline');
    const first = state.call.mock.calls[0][1].requestId, saved = sessionStorage.getItem('vybe:squad-attempts:v1')!;
    expect(saved).not.toContain(invitation); expect(saved).not.toContain('alice');
    vi.resetModules(); const fresh = await import('./mapSquadService');
    await expect(fresh.manageMapSquad(actor, { action: 'join', token: invitation }, guard)).rejects.toThrow('Offline');
    expect(state.call.mock.calls[1][1].requestId).toBe(first);
  });
  it.each([
    { status: 'left', squad: null, membership: squadFixture().membership },
    { squad: squadFixture({ membership: { role: 'member', status: 'active', revision: 'd'.repeat(48) } }) },
    { membership: { role: 'member', status: 'active', revision: 'b'.repeat(48) }, squad: squadFixture({ membership: { role: 'member', status: 'active', revision: 'b'.repeat(48) } }) },
  ])('rejects contradictory or non-owner create receipts %#', async patch => {
    state.call.mockImplementation(async (_name, input) => ({ data: response(input, patch), error: null }));
    await expect(manageMapSquad(actor, { action: 'create', name: 'Friday crew', emoji: '🗺️' }, guard)).rejects.toThrow('could not be confirmed');
  });
  it('accepts real archived and later-left replay receipts without granting current squad access', async () => {
    state.call.mockImplementation(async (_name, input) => ({ data: response(input, { status: 'archived', squad: null, membership: null }), error: null }));
    await expect(manageMapSquad(actor, { action: 'archive', squadId: 'squad-one', expectedRevision: 'a'.repeat(48) }, guard)).resolves.toMatchObject({ status: 'archived', squad: null });
    state.call.mockImplementation(async (_name, input) => ({ data: response(input, { status: 'left', squad: null, membership: { role: 'member', status: 'left', revision: 'e'.repeat(48) } }), error: null }));
    await expect(manageMapSquad(actor, { action: 'join', token: 'd'.repeat(64) }, guard)).resolves.toMatchObject({ status: 'left', squad: null });
  });
  it('retains a confirmed create until its visible consumer acknowledges it', async () => {
    const input = { action: 'create' as const, name: 'Friday crew', emoji: '🗺️' }; let visible = true;
    const receipt = await manageMapSquad(actor, input, () => { if (!visible) throw new Error('Hidden'); }, { deferAcknowledgement: true }) as import('./mapSquadService').SquadReceipt;
    const first = state.call.mock.calls[0][1].requestId; visible = false; expect(() => receipt.acknowledge!()).toThrow('Hidden');
    const retry = await manageMapSquad(actor, input, guard, { deferAcknowledgement: true }) as import('./mapSquadService').SquadReceipt;
    expect(state.call.mock.calls[1][1].requestId).toBe(first); retry.acknowledge!();
    await manageMapSquad(actor, input, guard); expect(state.call.mock.calls[2][1].requestId).not.toBe(first);
  });
  it('caps invitation UI access at its expiry despite a longer read lease', async () => {
    state.call.mockImplementation(async (_name, input) => ({ data: response(input, { token: invitation, invite: { squad: squadFixture(), expiresAt: Date.now() + 1000 } }), error: null }));
    const result = await manageMapSquad(actor, { action: 'previewInvite', token: invitation }, guard);
    expect(result.validUntil).toBeLessThanOrEqual(Date.now() + 1000);
  });
  it('separates the generated invitation lifetime from admission and adjusts both for server clock and RTT', async () => {
    const serverTime = Date.now() - 86_400_000, clock = vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValue(350);
    state.call.mockImplementation(async (_name, input) => ({ data: response(input, { serverTime, validUntil: serverTime + 15_000, invite: { token: invitation, active: true, expiresAt: serverTime + 86_400_000 } }), error: null }));
    const result = await manageMapSquad(actor, { action: 'createInvite', squadId: 'squad-one', expectedRevision: 'a'.repeat(48) }, guard) as import('./mapSquadService').SquadReceipt;
    expect(result.validUntil).toBeLessThanOrEqual(Date.now() + 14_750); expect(result.invitationExpiresAt).toBeGreaterThan(Date.now() + 86_399_000); expect(result.invitationExpiresAt).toBeLessThanOrEqual(Date.now() + 86_399_750); clock.mockRestore();
  });
  it('rejects exhausted RTT leases as retryable errors rather than endless loading', async () => {
    const performanceSpy = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(16_000);
    await expect(manageMapSquad(actor, { action: 'list' }, guard)).rejects.toThrow('expired while checking'); performanceSpy.mockRestore();
  });
  it('rejects a nonadvancing cursor and member IDs outside the supplied live candidates', async () => {
    state.call.mockImplementation(async (_name, input) => ({ data: response(input, { nextCursor: 'f'.repeat(48) }), error: null }));
    await expect(manageMapSquad(actor, { action: 'list', cursor: 'f'.repeat(48) }, guard)).rejects.toThrow('could not be confirmed');
    state.call.mockImplementation(async (_name, input) => ({ data: response(input, { squadId: 'squad-one', matchedProfileIds: ['unknown'] }), error: null }));
    await expect(manageMapSquad(actor, { action: 'matchMembers', squadId: 'squad-one', candidateProfileIds: ['profile-bob'] }, guard)).rejects.toThrow('could not be confirmed');
  });
  it('accepts the backend long avatar bound without loading that image', async () => {
    state.call.mockImplementation(async (_name, input) => ({ data: response(input, { squadId: 'squad-one', squad: squadFixture(), members: [{ profile_id: 'profile-alice', username: 'Alice', display_name: null, avatar_url: `https://example.invalid/${'a'.repeat(5000)}`, role: 'owner' }], nextCursor: null }), error: null }));
    await expect(manageMapSquad(actor, { action: 'read', squadId: 'squad-one' }, guard)).resolves.toMatchObject({ squadId: 'squad-one' });
  });
  it('discards a late account ABA reply and times out a hung read', async () => {
    const held = squadDeferred<unknown>(); state.call.mockReturnValue(held.promise);
    const request = manageMapSquad(actor, { action: 'list' }, guard), assertion = expect(request).rejects.toThrow('Account changed'); state.epoch += 2; held.resolve({ data: response({ action: 'list' }), error: null }); await assertion;
    vi.useFakeTimers(); state.call.mockReturnValue(new Promise(() => {})); const timeout = expect(manageMapSquad(actor, { action: 'list' }, guard)).rejects.toThrow('too long'); await vi.advanceTimersByTimeAsync(15_000); await timeout;
  });
  it('accepts only a code or same-origin fragment invitation, never query tokens or other hosts', () => {
    expect(squadInviteToken(invitation)).toBe(invitation); expect(squadInviteToken(`${location.origin}/map#squad-invite=${invitation}`)).toBe(invitation);
    expect(squadInviteToken(`${location.origin}/map?squadInvite=${invitation}`)).toBeNull(); expect(squadInviteToken(`https://other.invalid/map#squad-invite=${invitation}`)).toBeNull();
  });
});
