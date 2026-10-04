import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: mock.invoke }));
import { readFollowList, readFollowState, writeFollow } from './followService';
const actor = { expectedOwnerUid: 'alice', expectedProfileId: 'alice-profile' };
const guard = vi.fn(); const id = 'a'.repeat(64);
const receipt = { ownerUid: 'alice', profileId: 'alice-profile', action: 'state', relationshipId: id, revision: 0, state: 'none', targetId: 'bob-profile', privateAccount: true, blocked: false };
beforeEach(() => { vi.clearAllMocks(); mock.invoke.mockResolvedValue({ data: receipt, error: null }); });
describe('follow permission client', () => {
  it('binds state reads to the actor, target and current session before and after transport', async () => {
    expect(await readFollowState({ ...actor, targetId: 'bob-profile' }, guard)).toEqual(receipt);
    expect(guard).toHaveBeenCalledTimes(2); expect(mock.invoke).toHaveBeenCalledWith('manageFollow', { ...actor, targetId: 'bob-profile', action: 'state' });
  });
  it.each([{ ownerUid: 'other' }, { profileId: 'other' }, { targetId: 'other' }, { action: 'approve' }, { revision: -1 }, { blocked: true, state: 'following' }])('rejects mismatched receipts %j', async patch => {
    mock.invoke.mockResolvedValue({ data: { ...receipt, ...patch } }); await expect(readFollowState({ ...actor, targetId: 'bob-profile' }, guard)).rejects.toThrow();
  });
  it('does not send from an expired account lease or accept a late receipt', async () => {
    const expired = () => { throw new Error('changed'); }; await expect(readFollowState({ ...actor, targetId: 'bob-profile' }, expired)).rejects.toThrow('changed'); expect(mock.invoke).not.toHaveBeenCalled();
    let finish!: (value: unknown) => void; mock.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    let changed = false; const pending = readFollowState({ ...actor, targetId: 'bob-profile' }, () => { if (changed) throw new Error('changed'); });
    changed = true; finish({ data: receipt }); await expect(pending).rejects.toThrow('changed');
  });
  it('requires the exact acknowledgement and revision for owner decisions', async () => {
    const input = { ...actor, action: 'approve' as const, relationshipId: id, revision: 4 };
    for (const patch of [{ revision: 4 }, { relationshipId: 'b'.repeat(64) }, { state: 'pending' }, { action: 'decline' }]) {
      mock.invoke.mockResolvedValue({ data: { ...receipt, action: 'approve', state: 'following', revision: 5, ...patch } }); await expect(writeFollow(input, guard)).rejects.toThrow();
    }
    mock.invoke.mockResolvedValue({ data: { ...receipt, action: 'approve', state: 'following', revision: 5 } }); expect((await writeFollow(input, guard)).revision).toBe(5);
  });
  it('keeps private requests distinct from acknowledged following', async () => {
    mock.invoke.mockResolvedValue({ data: { ...receipt, action: 'request', state: 'pending', revision: 1 } });
    expect((await writeFollow({ ...actor, action: 'request', targetId: 'bob-profile', revision: 0 }, guard)).state).toBe('pending');
  });
  it('rejects wrong-view, duplicate and non-advancing lists', async () => {
    const row = { relationshipId: id, revision: 2, status: 'pending', approvedByOwner: false, canApprove: true, follower: { id: 'bob-profile', username: 'bob', displayName: null } };
    const page = { ownerUid: 'alice', profileId: 'alice-profile', action: 'list', view: 'requests', relationships: [row], nextCursor: null };
    for (const patch of [{ view: 'followers' }, { relationships: [row, row] }, { nextCursor: id }]) {
      mock.invoke.mockResolvedValue({ data: { ...page, ...patch } }); await expect(readFollowList({ ...actor, view: 'requests', cursor: id }, guard)).rejects.toThrow();
    }
    mock.invoke.mockResolvedValue({ data: page }); expect((await readFollowList({ ...actor, view: 'requests' }, guard)).relationships).toHaveLength(1);
  });
});
