import { describe, expect, it } from 'vitest';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import type { DMConversationPreview } from '@/features/dms/dm.types';
import {
  compareInboxActivity,
  filterConversationsForTab,
  filterPreviewsForFilter,
} from '@/lib/dmInboxOrganize';

const ME = 'me';

function conv(partial: Partial<LoadedDMConversation> & { id: string }): LoadedDMConversation {
  return {
    is_group: false,
    members: [],
    unread_count: 0,
    _sortTime: '2026-07-12T12:00:00.000Z',
    _hasUnread: false,
    updated_at: '2026-07-12T12:00:00.000Z',
    ...partial,
  } as LoadedDMConversation;
}

function preview(partial: Partial<DMConversationPreview> & { id: string }): DMConversationPreview {
  return {
    conversation: conv({ id: partial.id }),
    conversationId: partial.id,
    conversationType: 'direct',
    displayName: 'Alex',
    previewText: 'hey',
    statusLine: '',
    statusKind: 'none' as DMConversationPreview['statusKind'],
    deliveryStatus: 'sent',
    latestMessageType: 'text',
    latestMessageAt: '2026-07-12T12:00:00.000Z',
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
    presenceState: 'unknown',
    storyState: 'none',
    ...partial,
  } as DMConversationPreview;
}

describe('compareInboxActivity', () => {
  it('sorts by latest activity first', () => {
    const older = conv({ id: 'a', _sortTime: '2026-07-12T10:00:00.000Z' });
    const newer = conv({ id: 'b', _sortTime: '2026-07-12T12:00:00.000Z' });
    expect(compareInboxActivity(newer, older, ME)).toBeLessThan(0);
    expect(compareInboxActivity(older, newer, ME)).toBeGreaterThan(0);
  });

  it('keeps pinned above unpinned even when older', () => {
    const pinned = conv({
      id: 'a',
      _sortTime: '2026-07-12T08:00:00.000Z',
      members: [{ user_id: ME, is_pinned: true, pin_order: 1 } as never],
    });
    const fresher = conv({ id: 'b', _sortTime: '2026-07-12T18:00:00.000Z' });
    expect(compareInboxActivity(pinned, fresher, ME)).toBeLessThan(0);
  });

  it('does not reorder by unread status', () => {
    const sameTime = '2026-07-12T12:00:00.000Z';
    const unread = conv({ id: 'b', _sortTime: sameTime, _hasUnread: true });
    const read = conv({ id: 'a', _sortTime: sameTime, _hasUnread: false });
    // Same time → conversationId tie-breaker only (a before b).
    expect(compareInboxActivity(read, unread, ME)).toBeLessThan(0);
    expect(compareInboxActivity(unread, read, ME)).toBeGreaterThan(0);
  });
});

describe('filterConversationsForTab', () => {
  const now = '2026-07-12T12:00:00.000Z';
  const earlier = '2026-07-12T10:00:00.000Z';

  it('all: returns every conversation sorted by activity', () => {
    const rows = [
      conv({ id: 'a', _sortTime: earlier }),
      conv({ id: 'b', _sortTime: now }),
    ];
    const result = filterConversationsForTab(rows, 'all', ME);
    expect(result.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('needs_reply: includes only unanswered peer messages, excludes muted/group/noise', () => {
    const needsReply = conv({
      id: 'a',
      last_message: { id: 'm1', conversation_id: 'a', sender_id: 'peer', content: 'hi', created_at: now } as never,
    });
    const alreadyReplied = conv({
      id: 'b',
      last_message: { id: 'm2', conversation_id: 'b', sender_id: ME, content: 'hi', created_at: now } as never,
    });
    const mutedNeedsReply = conv({
      id: 'c',
      members: [{ user_id: ME, is_muted: true } as never],
      last_message: { id: 'm3', conversation_id: 'c', sender_id: 'peer', content: 'hi', created_at: now } as never,
    });
    const groupNeedsReply = conv({
      id: 'd',
      is_group: true,
      last_message: { id: 'm4', conversation_id: 'd', sender_id: 'peer', content: 'hi', created_at: now } as never,
    });
    const noiseNeedsReply = conv({
      id: 'e',
      last_message: { id: 'm5', conversation_id: 'e', sender_id: 'peer', message_type: 'call', created_at: now } as never,
    });

    const result = filterConversationsForTab(
      [needsReply, alreadyReplied, mutedNeedsReply, groupNeedsReply, noiseNeedsReply],
      'needs_reply',
      ME,
    );
    expect(result.map((c) => c.id)).toEqual(['a']);
  });

  it('active: shows online peers only, sorted by latest message', () => {
    const onlineRecent = conv({
      id: 'a',
      _sortTime: now,
      members: [
        { user_id: ME } as never,
        { user_id: 'peer-a', profile: { id: 'peer-a' } } as never,
      ],
    });
    const onlineOlder = conv({
      id: 'b',
      _sortTime: earlier,
      members: [
        { user_id: ME } as never,
        { user_id: 'peer-b', profile: { id: 'peer-b' } } as never,
      ],
    });
    const offline = conv({
      id: 'c',
      _sortTime: now,
      members: [
        { user_id: ME } as never,
        { user_id: 'peer-c', profile: { id: 'peer-c' } } as never,
      ],
    });
    const result = filterConversationsForTab([onlineOlder, offline, onlineRecent], 'active', {
      profileId: ME,
      presenceOnlineIds: new Set(['peer-a', 'peer-b']),
      resolveOtherProfileId: (c) =>
        c.members?.find((m) => m.user_id !== ME)?.profile?.id
          ? String(c.members.find((m) => m.user_id !== ME)?.profile?.id)
          : undefined,
    });
    expect(result.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('filterPreviewsForFilter', () => {
  it('groups: chronological, not mention/unread boosted', () => {
    const rows = [
      preview({
        id: 'g1',
        isGroup: true,
        latestMessageAt: '2026-07-12T10:00:00.000Z',
        mentionCount: 9,
        isUnread: true,
      }),
      preview({
        id: 'g2',
        isGroup: true,
        latestMessageAt: '2026-07-12T14:00:00.000Z',
        mentionCount: 0,
        isUnread: false,
      }),
    ];
    expect(filterPreviewsForFilter(rows, 'groups').map((r) => r.id)).toEqual(['g2', 'g1']);
  });
});
