import { describe, expect, it } from 'vitest';
import {
  canShowVybeScore,
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

  it('shows another person a public score and keeps a private score with the owner', () => {
    expect(canShowVybeScore({ own: false })).toBe(true);
    expect(canShowVybeScore({ own: false, privacy: 'public' })).toBe(true);
    expect(canShowVybeScore({ own: false, privacy: 'private' })).toBe(false);
    expect(canShowVybeScore({ own: false, privacy: 'friends_only', friend: false })).toBe(false);
    expect(canShowVybeScore({ own: false, privacy: 'friends_only', friend: true })).toBe(true);
    expect(canShowVybeScore({ own: true, privacy: 'private' })).toBe(true);
  });

  it('enforces daily caps', () => {
    expect(isUnderVybeDailyCap('friend_accepted', 9)).toBe(true);
    expect(isUnderVybeDailyCap('friend_accepted', 10)).toBe(false);
  });
});
