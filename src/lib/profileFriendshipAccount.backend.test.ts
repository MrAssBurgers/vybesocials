// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ resolve: vi.fn(async () => 'bob-profile') }));
vi.mock('../../functions/src/_shared/admin', () => ({ db: {}, requireAuth: (request: { auth: { uid: string } }) => request.auth.uid, rateLimit: vi.fn(), enforceRateLimit: vi.fn() }));
vi.mock('../../functions/src/_shared/friendship', () => ({ resolveProfileId: state.resolve, areFriends: vi.fn(), friendshipPairId: vi.fn(), isBlocked: vi.fn() }));
import { mutateFriendship } from '../../functions/src/friendProfile';
beforeEach(() => state.resolve.mockClear());
describe('optional profile friendship actor binding', () => {
  it.each(['alice', '', null, 7, undefined])('rejects mismatched or malformed supplied actor %# before any identity/database lookup', async expectedOwnerUid => {
    await expect(mutateFriendship.run({ auth: { uid: 'bob' }, data: { expectedOwnerUid, action: 'send' } } as never)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.resolve).not.toHaveBeenCalled();
  });
  it.each([{ expectedOwnerUid: 'bob' }, {}])('preserves matching and absent-field callers %#', async binding => {
    await expect(mutateFriendship.run({ auth: { uid: 'bob' }, data: { ...binding, action: 'invalid' } } as never)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(state.resolve).toHaveBeenCalledExactlyOnceWith('bob');
  });
});
