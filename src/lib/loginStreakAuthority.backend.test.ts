// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { canonicalStreakTimezone, loginStreakRestoreAccess, streakDayStartsAt, streakLocalDay } from '../../functions/src/_shared/loginStreakAuthority';

describe('login streak civil calendar', () => {
  it.each([
    ['2026-03-08', 'America/New_York', '2026-03-08T05:00:00.000Z', 23],
    ['2026-11-01', 'America/New_York', '2026-11-01T04:00:00.000Z', 25],
    ['2026-06-01', 'Asia/Kathmandu', '2026-05-31T18:15:00.000Z', 24],
  ])('uses actual midnight for %s in %s', (date, zone, expected, hours) => {
    const day = Date.parse(`${date}T00:00:00Z`) / 86400000;
    expect(new Date(streakDayStartsAt(day, zone)).toISOString()).toBe(expected);
    expect(streakDayStartsAt(day + 1, zone) - streakDayStartsAt(day, zone)).toBe(hours * 3600000);
    expect(streakLocalDay(Date.parse(expected) - 1, zone)).toBe(day - 1);
    expect(streakLocalDay(Date.parse(expected), zone)).toBe(day);
  });
  it('rejects unknown and unbounded caller timezones instead of silently changing calendars', () => {
    expect(() => canonicalStreakTimezone('Not/A_Zone')).toThrow();
    expect(() => canonicalStreakTimezone('UTC'.repeat(100))).toThrow();
    expect(canonicalStreakTimezone('US/Central')).toBe('America/Chicago');
  });
});

describe('streak restore entitlement', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const gift = (overrides = {}) => ({ schema_version: 1, grant_id: 'gift', user_id: 'alice', gifted_by: 'operator', status: 'accepted', is_active: true,
    created_at: '2026-10-01T00:00:00Z', accepted_at: '2026-10-02T00:00:00Z', revoked_at: null, expires_at: '2026-10-11T00:00:00Z', ...overrides });
  it('preserves the existing server-defined free functional launch policy', () => {
    expect(loginStreakRestoreAccess('alice', null, null, now)).toBe('launch-free');
  });
  it('accepts a current protected gift or subscription when free policy is disabled', () => {
    expect(loginStreakRestoreAccess('alice', gift(), null, now, false)).toBe('premium');
    expect(loginStreakRestoreAccess('alice', gift({ expires_at: null }), null, now, false)).toBe('premium');
    expect(loginStreakRestoreAccess('alice', null, { status: 'active', user_id: 'alice', expires_at: now + 1 }, now, false)).toBe('premium');
  });
  it.each([
    { expires_at: '2026-10-10T12:00:00Z' }, { user_id: 'bob' }, { status: 'pending', is_active: false, accepted_at: null },
    { status: 'revoked', is_active: false, revoked_at: '2026-10-09T12:00:00Z' }, { is_active: 'true' },
  ])('rejects expired, foreign or inactive gift %o when policy is disabled', overrides => {
    expect(loginStreakRestoreAccess('alice', gift(overrides), null, now, false)).toBe('none');
  });
  it.each([
    { status: 'active', expires_at: now }, { status: 'expired', expires_at: now + 10000 }, { status: 'active', expires_at: 'bad-date' },
    { status: 'active', expires_at: null, user_id: 'bob' }, { is_premium: true, is_owner: true },
  ])('does not trust expired/malformed subscriptions or profile flags %o', subscription => {
    expect(loginStreakRestoreAccess('alice', null, subscription, now, false)).toBe('none');
  });
});
