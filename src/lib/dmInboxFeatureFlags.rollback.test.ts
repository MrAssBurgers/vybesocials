import { describe, expect, it } from 'vitest';
import { relationshipLabelForPreview } from './conversationOptionsLabel';
import type { DMConversationPreview } from '@/features/dms/dm.types';

function mockPreview(
  partial: Partial<DMConversationPreview>,
): DMConversationPreview {
  return {
    conversation: { id: 'c1', is_group: false } as DMConversationPreview['conversation'],
    id: 'c1',
    conversationId: 'c1',
    conversationType: 'direct',
    displayName: 'Parker',
    previewText: 'Hi',
    statusLine: 'Received',
    statusKind: 'received',
    deliveryStatus: 'read',
    latestMessageType: 'text',
    unreadCount: 0,
    mentionCount: 0,
    isUnread: false,
    isPinned: false,
    pinOrder: 0,
    isMuted: false,
    isArchived: false,
    needsReply: false,
    isGroup: false,
    isTyping: false,
    typingNames: [],
    isOnline: false,
    isAway: false,
    presenceState: 'offline',
    storyState: 'none',
    ...partial,
  };
}

describe('relationship rollback labels', () => {
  it('uses legacy close_friend badge when semantic emoji is absent', () => {
    const label = relationshipLabelForPreview(
      mockPreview({ relationshipBadge: 'close_friend' }),
    );
    expect(label).toBe('Best Friends');
  });

  it('prefers semantic relationship state when present', () => {
    const label = relationshipLabelForPreview(
      mockPreview({
        relationshipEmoji: '💛',
        relationship: { primary_relationship_state: 'number_one' },
      }),
    );
    expect(label).toBe('Number One 💛');
  });
});
