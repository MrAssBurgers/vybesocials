import { describe, expect, it } from 'vitest';
import {
  isUnderVybeDailyCap,
  shouldAwardVybeScoreEvent,
  vybeScorePointsForEvent,
} from './vybeScorePure';

describe('vybeScorePure', () => {
  it('excludes text DMs from score awards', () => {
    expect(shouldAwardVybeScoreEvent('message_sent')).toBe(false);
    expect(vybeScorePointsForEvent('message_sent')).toBe(0);
  });

  it('awards snaps and friend accepts', () => {
    expect(shouldAwardVybeScoreEvent('snap_sent')).toBe(true);
    expect(vybeScorePointsForEvent('snap_sent')).toBe(2);
    expect(vybeScorePointsForEvent('friend_accepted')).toBe(1);
  });

  it('enforces daily caps', () => {
    expect(isUnderVybeDailyCap('friend_accepted', 9)).toBe(true);
    expect(isUnderVybeDailyCap('friend_accepted', 10)).toBe(false);
  });
});
