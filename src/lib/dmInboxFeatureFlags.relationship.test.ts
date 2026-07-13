import { afterEach, describe, expect, it } from 'vitest';
import {
  isRelationshipEmojiUiEnabled,
  isRelationshipProjectionReadEnabled,
  isVybeScoreUiEnabled,
  setDmInboxFlag,
} from './dmInboxFeatureFlags';

describe('relationship feature flags', () => {
  afterEach(() => {
    setDmInboxFlag('relationship_projection_read', false);
    setDmInboxFlag('relationship_emoji_ui', false);
    setDmInboxFlag('vybe_score_ui', false);
  });

  it('defaults relationship UI flags to off', () => {
    expect(isRelationshipProjectionReadEnabled()).toBe(false);
    expect(isRelationshipEmojiUiEnabled()).toBe(false);
    expect(isVybeScoreUiEnabled()).toBe(false);
  });

  it('requires projection read before emoji UI', () => {
    setDmInboxFlag('relationship_emoji_ui', true);
    expect(isRelationshipEmojiUiEnabled()).toBe(false);
    setDmInboxFlag('relationship_projection_read', true);
    expect(isRelationshipEmojiUiEnabled()).toBe(true);
  });
});
