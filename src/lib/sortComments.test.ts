import { describe, expect, it } from 'vitest';
import { sortComments } from './sortComments';
const older = { id: 'older', created_at: '2026-10-03T12:00:00Z', like_count: 9 };
const newer = { id: 'newer', created_at: '2026-10-04T12:00:00Z', like_count: 1 };
describe('comment sort choices', () => {
  it('ranks top by likes while newest ranks by time without mutating its input', () => {
    const rows = Object.freeze([newer, older]);
    expect(sortComments(rows, 'top')).toEqual([older, newer]);
    expect(sortComments(rows, 'newest')).toEqual([newer, older]);
    expect(rows).toEqual([newer, older]);
  });
  it('breaks equal like counts by newest, then stable ID', () => {
    const rows = [{ ...older, id: 'z' }, { ...newer, like_count: 9 }, { ...older, id: 'a' }];
    expect(sortComments(rows, 'top').map(row => row.id)).toEqual(['newer', 'a', 'z']);
  });
  it('handles missing or malformed metadata deterministically', () => {
    const rows = [{ id: 'b', created_at: 'invalid', like_count: NaN }, { id: 'a', created_at: '', like_count: -10 }, { id: 'c', created_at: newer.created_at }];
    expect(sortComments(rows, 'top').map(row => row.id)).toEqual(['c', 'a', 'b']);
  });
});
