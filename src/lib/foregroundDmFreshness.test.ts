import { describe, expect, it } from 'vitest';
import {
  FOREGROUND_DM_NOTIFY_MAX_AGE_MS,
  isFreshForegroundDmMessage,
} from '@/lib/foregroundDmFreshness';

describe('isFreshForegroundDmMessage', () => {
  const now = Date.parse('2026-07-14T22:00:00.000Z');

  it('accepts messages created within the live window', () => {
    expect(
      isFreshForegroundDmMessage(new Date(now - 10_000).toISOString(), now),
    ).toBe(true);
  });

  it('rejects historical messages that would spam on listener bootstrap', () => {
    expect(
      isFreshForegroundDmMessage(
        new Date(now - FOREGROUND_DM_NOTIFY_MAX_AGE_MS - 1).toISOString(),
        now,
      ),
    ).toBe(false);
  });

  it('rejects missing or invalid timestamps', () => {
    expect(isFreshForegroundDmMessage(undefined, now)).toBe(false);
    expect(isFreshForegroundDmMessage('not-a-date', now)).toBe(false);
  });
});
