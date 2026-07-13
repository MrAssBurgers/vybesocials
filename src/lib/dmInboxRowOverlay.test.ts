import { describe, expect, it } from 'vitest';
import { applyDmInboxRowLiveOverlay } from './dmInboxRowOverlay';
import type { DMConversationPreview } from '@/features/dms/dm.types';

function basePreview(): DMConversationPreview {
  return {
    conversation: { id: 'c1' } as never,
    id: 'c1',
    conversationId: 'c1',
    conversationType: 'direct',
    displayName: 'Test',
    previewText: 'hi',
    statusLine: 'Delivered',
    statusKind: 'message',
    deliveryStatus: 'Delivered',
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
    isVerified: false,
    fromProjection: false,
  };
}

describe('applyDmInboxRowLiveOverlay', () => {
  it('returns the same preview reference when overlay is unchanged', () => {
    const preview = basePreview();
    const next = applyDmInboxRowLiveOverlay(preview, {
      isTyping: false,
      presenceActivity: undefined,
    });
    expect(next).toBe(preview);
  });

  it('patches typing without mutating the original preview', () => {
    const preview = basePreview();
    const next = applyDmInboxRowLiveOverlay(preview, { isTyping: true });
    expect(next).not.toBe(preview);
    expect(next.isTyping).toBe(true);
    expect(next.statusLine).toBe('Typing…');
    expect(preview.isTyping).toBe(false);
  });

  it('patches presence activity for a single row', () => {
    const preview = basePreview();
    const next = applyDmInboxRowLiveOverlay(preview, {
      presenceActivity: 'listening',
    });
    expect(next.presenceActivity).toBe('listening');
    expect(next.isOnline).toBe(true);
    expect(next.presenceState).toBe('online');
  });
});
