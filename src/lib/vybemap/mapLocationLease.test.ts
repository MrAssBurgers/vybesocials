import { describe, expect, it, vi } from 'vitest';
import { captureMapLocationLease, currentMapLocation } from './mapLocationLease';
import type { LiveFriend } from './types';
const friend = (extra: Partial<LiveFriend> = {}): LiveFriend => ({ id: 'bob', user_id: 'bob', accessRevision: 'a'.repeat(48), accessUntil: Date.now() + 15000, latitude: 30.01, longitude: -97.01, label: 'Bob', updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 120000).toISOString(), sharing_enabled: true, ...extra });
describe('private map selection/route leases', () => {
  it('uses newly admitted position data instead of a retained selected object', () => {
    const initial = friend(), lease = captureMapLocationLease(initial, 'alice:1'), fresh = friend({ latitude: 31 });
    expect(currentMapLocation(lease, 'alice:1', [fresh])).toBe(fresh);
  });
  it.each(['revoked', 'expired', 'precision changed', 'account ABA'])('removes selected/finder/route data when %s', reason => {
    const initial = friend(), lease = captureMapLocationLease(initial, 'alice:1');
    const friends = reason === 'revoked' ? [] : [friend(reason === 'expired' ? { accessUntil: Date.now() - 1 } : reason === 'precision changed' ? { accessRevision: 'b'.repeat(48) } : {})];
    expect(currentMapLocation(lease, reason === 'account ABA' ? 'alice:3' : 'alice:1', friends)).toBeUndefined();
  });
  it('a newer admitted sample cannot extend an old route destination lifetime', () => {
    const now = Date.now();
    const lease = captureMapLocationLease(friend({ sampleExpiresAt: now + 5000 }), 'alice:1', true);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 6000);
    expect(currentMapLocation(lease, 'alice:1', [friend({ sampleExpiresAt: now + 120000, accessUntil: now + 15000 })])).toBeUndefined();
    clock.mockRestore();
  });
  it('refuses an expired marker action before a route or external navigation starts', () => {
    expect(() => captureMapLocationLease(friend({ accessUntil: Date.now() - 1 }), 'alice:1')).toThrow('Refresh');
  });
});
