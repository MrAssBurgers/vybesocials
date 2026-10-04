import { describe, expect, it } from 'vitest';
import { moderationCountDisplay } from './moderationCountDisplay';

describe('moderation dashboard count display', () => {
  it('shows loading instead of adding an absent report count into NaN', () => {
    expect(moderationCountDisplay({ data: undefined, isPending: true, isError: false }, 3)).toEqual({ reports: 'Loading', pending: 'Loading' });
  });
  it('does not present a cached count after its refresh failed', () => {
    expect(moderationCountDisplay({ data: 7, isPending: false, isError: true }, 3)).toEqual({ reports: 'Unavailable', pending: 'Unavailable' });
  });
  it('preserves confirmed zero and numeric totals', () => {
    expect(moderationCountDisplay({ data: 0, isPending: false, isError: false }, 3)).toEqual({ reports: 0, pending: 3 });
    expect(moderationCountDisplay({ data: 2, isPending: false, isError: false }, 3)).toEqual({ reports: 2, pending: 5 });
  });
  it.each([NaN, -1, 1.5])('fails closed for an invalid count %s', data => {
    expect(moderationCountDisplay({ data, isPending: false, isError: false }, 3)).toEqual({ reports: 'Unavailable', pending: 'Unavailable' });
  });
});
