import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ invoke: vi.fn(), single: vi.fn() }));
vi.mock('./firebase/functionsService', () => ({ invokeFunction: (...args: unknown[]) => { state.invoke(...args); return { single: state.single }; } }));
import { profileFriendshipAction } from './profileFriendshipAction';
beforeEach(() => { vi.clearAllMocks(); state.single.mockResolvedValue({ data: { ok: true } }); });
describe('profile friendship actions bind the initiating actor', () => {
  it('sends account-bound intent without an identity lookup or optimistic cache mutation', async () => {
    await profileFriendshipAction({ action: 'send', targetId: 'target', expectedOwnerUid: 'alice' }, vi.fn());
    expect(state.invoke).toHaveBeenCalledExactlyOnceWith('mutate-friendship', { action: 'send', target_profile_id: 'target', expectedOwnerUid: 'alice' });
  });
  it('checks the current matching request before accepting', async () => {
    state.single.mockResolvedValueOnce({ data: { state: 'pending_incoming', request_id: 'current' } });
    await profileFriendshipAction({ action: 'accept', targetId: 'target', expectedOwnerUid: 'alice' }, vi.fn());
    expect(state.invoke).toHaveBeenLastCalledWith('mutate-friendship', { action: 'accept', request_id: 'current', expectedOwnerUid: 'alice' });
  });
  it('does not mutate if the account changes during request lookup', async () => {
    let current = true; state.single.mockImplementation(async () => { current = false; return { data: { state: 'accepted', request_id: 'current' } }; });
    const guard = () => { if (!current) throw new Error('changed'); };
    await expect(profileFriendshipAction({ action: 'unfriend', targetId: 'target', expectedOwnerUid: 'alice' }, guard)).rejects.toThrow('changed');
    expect(state.invoke).toHaveBeenCalledTimes(1);
  });
  it.each([{ state: 'pending_outgoing', request_id: 'r' }, { state: 'pending_incoming', request_id: '' }, null])('refuses an incompatible or malformed request %#', async data => {
    state.single.mockResolvedValueOnce({ data });
    await expect(profileFriendshipAction({ action: 'accept', targetId: 'target', expectedOwnerUid: 'alice' }, vi.fn())).rejects.toThrow('request changed'); expect(state.invoke).toHaveBeenCalledTimes(1);
  });
});
