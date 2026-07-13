import { describe, expect, it } from 'vitest';
import {
  pickPrimaryInboxEmoji,
  resolveRelationshipEmoji,
  resolveStreakDisplay,
  DEFAULT_RELATIONSHIP_EMOJIS,
} from './relationshipEmojiMap';

describe('relationshipEmojiMap', () => {
  it('maps primary states to default emojis', () => {
    expect(resolveRelationshipEmoji('best_friend')).toBe(DEFAULT_RELATIONSHIP_EMOJIS.best_friend);
    expect(resolveRelationshipEmoji('number_one')).toBe('💛');
    expect(resolveRelationshipEmoji('friend')).toBe('');
  });

  it('prefers custom emoji prefs', () => {
    expect(
      resolveRelationshipEmoji('best_friend', { states: { best_friend: '🌟' } }),
    ).toBe('🌟');
  });

  it('prioritizes birthday over primary state', () => {
    const emoji = pickPrimaryInboxEmoji({
      primaryState: 'best_friend',
      birthdayState: 'today',
    });
    expect(emoji).toBe('🎂');
  });

  it('formats active streak display', () => {
    expect(resolveStreakDisplay(42, 'active')).toBe('🔥 42');
    expect(resolveStreakDisplay(0, 'active')).toBe('');
    expect(resolveStreakDisplay(5, 'expired')).toBe('');
  });

  it('shows warning streak emoji', () => {
    expect(resolveStreakDisplay(3, 'warning')).toBe('⌛ 3');
  });

  it('resolves favorite emoji', () => {
    const emoji = pickPrimaryInboxEmoji({
      favoriteState: 'pinned',
      primaryState: null,
    });
    expect(emoji).toBe('💫');
  });
});
