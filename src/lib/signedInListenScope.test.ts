import { describe, expect, it } from 'vitest';
import {
  PROFILE_LAST_ACTIVE_MIRROR_MS,
  PRESENCE_LISTEN_CHUNK,
  PRESENCE_ONLINE_WINDOW_MS,
  chunkIds,
  ownProfileRealtimeFilter,
  presenceIdsKey,
  presenceIsOnline,
  shouldMirrorLastActive,
} from './signedInListenScope';

describe('signed-in listen scope', () => {
  it('limits profile realtime to the signed-in account', () => {
    expect(ownProfileRealtimeFilter('alice')).toBe('user_id=eq.alice');
  });

  it('chunks presence ids without mutating or repeating them', () => {
    const ids = ['c', 'a', 'b', 'a', ''];
    expect(chunkIds(ids, 2)).toEqual([['a', 'b'], ['c']]);
    expect(ids).toEqual(['c', 'a', 'b', 'a', '']);
    expect(presenceIdsKey(['b', 'a', 'a'])).toBe('a,b');
    expect(chunkIds(['only'])[0]).toHaveLength(1);
    expect(PRESENCE_LISTEN_CHUNK).toBeLessThanOrEqual(30);
  });

  it('treats a stale heartbeat as offline and spaces profile activity writes', () => {
    const now = Date.now();
    expect(presenceIsOnline(true, new Date(now - PRESENCE_ONLINE_WINDOW_MS - 1).toISOString(), now)).toBe(false);
    expect(presenceIsOnline(true, new Date(now - 1_000).toISOString(), now)).toBe(true);
    expect(presenceIsOnline(false, new Date(now).toISOString(), now)).toBe(false);
    expect(shouldMirrorLastActive(now, 0)).toBe(true);
    expect(shouldMirrorLastActive(now, now - PROFILE_LAST_ACTIVE_MIRROR_MS + 1)).toBe(false);
  });
});
