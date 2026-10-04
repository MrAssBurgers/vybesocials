import { describe, expect, it } from 'vitest';
import { isLocalArea, nearbyLocalArea, sameLocalArea } from '../../functions/src/_shared/localArea';

describe('approximate Local areas', () => {
  it('rejects precise, malformed and out-of-range coordinates', () => {
    for (const input of [null, [], {}, { lat: 41.123, lng: -87.6 }, { lat: NaN, lng: 0 }, { lat: 91, lng: 0 },
      { lat: 0, lng: 180 }, { lat: 0, lng: -180.1 }, { lat: 0, lng: 0, precise: true }, { lat: '0', lng: 0 }]) expect(isLocalArea(input)).toBe(false);
    expect(isLocalArea({ lat: 41.8, lng: -87.6 })).toBe(true);
    expect(isLocalArea({ lat: -90, lng: -180 })).toBe(true);
  });
  it('measures the fixed 25-mile radius across the dateline and near poles', () => {
    expect(nearbyLocalArea({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 })).toBe(true);
    expect(nearbyLocalArea({ lat: 0, lng: 0 }, { lat: 0.3, lng: 0 })).toBe(true);
    expect(nearbyLocalArea({ lat: 0, lng: 0 }, { lat: 0.4, lng: 0 })).toBe(false);
    expect(nearbyLocalArea({ lat: 90, lng: -170 }, { lat: 90, lng: 170 })).toBe(true);
    expect(nearbyLocalArea({ lat: 0, lng: 0 }, { lat: 0, lng: -180 })).toBe(false);
  });
  it('binds cursor areas without accepting invalid equal-looking objects', () => {
    expect(sameLocalArea(null, undefined)).toBe(true);
    expect(sameLocalArea({ lat: 1, lng: 2 }, { lng: 2, lat: 1 })).toBe(true);
    expect(sameLocalArea({ lat: 1, lng: 2 }, { lat: 1, lng: 2.1 })).toBe(false);
    expect(sameLocalArea({}, {})).toBe(false);
  });
});
