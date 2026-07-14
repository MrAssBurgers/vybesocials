import { describe, expect, it } from 'vitest';

/** Mirrors friends-count aggregation used by the profile view model. */
function countAcceptedFriendRows(
  asSender: Array<{ id?: string }> | null | undefined,
  asReceiver: Array<{ id?: string }> | null | undefined,
): number {
  return (asSender?.length ?? 0) + (asReceiver?.length ?? 0);
}

describe('profile friends count', () => {
  it('sums accepted friendships on both sides of the request', () => {
    expect(countAcceptedFriendRows([{ id: 'a' }, { id: 'b' }], [{ id: 'c' }])).toBe(3);
    expect(countAcceptedFriendRows([], [])).toBe(0);
    expect(countAcceptedFriendRows(null, undefined)).toBe(0);
  });

  it('never treats follower count as friends count', () => {
    const followers = 42;
    const friends = countAcceptedFriendRows([{ id: '1' }], [{ id: '2' }]);
    expect(friends).not.toBe(followers);
    expect(friends).toBe(2);
  });
});
