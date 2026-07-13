import { describe, expect, it } from 'vitest';
import { relationshipLabelForPreview } from './conversationOptionsLabel';
import type { DMConversationPreview } from '@/features/dms/dm.types';

describe('conversationOptionsLabel', () => {
  it('returns Friends by default', () => {
    expect(relationshipLabelForPreview(undefined)).toBe('Friends');
  });

  it('formats best friend with emoji', () => {
    const preview = {
      relationshipEmoji: '😊',
      relationship: { primary_relationship_state: 'best_friend' },
    } as DMConversationPreview;
    expect(relationshipLabelForPreview(preview)).toBe('Best Friend 😊');
  });
});
