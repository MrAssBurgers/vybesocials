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

  it('breaks activity ties by pinned status', () => {
    const sameTime = '2026-07-12T12:00:00.000Z';
    const pinned = conv({
      id: 'a',
      _sortTime: sameTime,
      members: [{ user_id: ME, is_pinned: true } as never],
    });
    const notPinned = conv({ id: 'b', _sortTime: sameTime });
    expect(compareInboxActivity(pinned, notPinned, ME)).toBeLessThan(0);
  });

  it('breaks remaining ties by unread status', () => {
    const sameTime = '2026-07-12T12:00:00.000Z';
    const unread = conv({ id: 'a', _sortTime: sameTime, _hasUnread: true });
    const read = conv({ id: 'b', _sortTime: sameTime, _hasUnread: false });
    expect(compareInboxActivity(unread, read, ME)).toBeLessThan(0);
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

  it('active: direct chats only, online before recently-active before offline', () => {
    const online = conv({ id: 'a', _sortTime: earlier });
    const recentlyActive = conv({ id: 'b', _sortTime: earlier });
    const offline = conv({ id: 'c', _sortTime: now });
    const group = conv({ id: 'd', is_group: true, _sortTime: now });

    const result = filterConversationsForTab(
      [online, recentlyActive, offline, group],
      'active',
      {
        profileId: ME,
        resolveOtherProfileId: (c) => `other-${c.id}`,
        presenceOnlineIds: new Set(['other-a']),
        recentlyActiveIds: new Set(['other-b']),
      },
    );
    expect(result.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(result.some((c) => c.id === 'd')).toBe(false);
  });

  it('unread: falls back to full activity-sorted list when nothing is unread', () => {
    const rows = [conv({ id: 'a', _sortTime: earlier }), conv({ id: 'b', _sortTime: now })];
    const result = filterConversationsForTab(rows, 'unread', ME);
    expect(result.map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('filterPreviewsForFilter', () => {
  it('all: sorts previews by latest activity', () => {
    const rows = [
      preview({ id: 'a', latestMessageAt: '2026-07-12T10:00:00.000Z' }),
      preview({ id: 'b', latestMessageAt: '2026-07-12T12:00:00.000Z' }),
    ];
    const result = filterPreviewsForFilter(rows, 'all');
    expect(result.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('needs_reply: excludes muted and group previews', () => {
    const rows = [
      preview({ id: 'a', needsReply: true }),
      preview({ id: 'b', needsReply: true, isMuted: true }),
      preview({ id: 'c', needsReply: true, isGroup: true }),
      preview({ id: 'd', needsReply: false }),
    ];
    const result = filterPreviewsForFilter(rows, 'needs_reply');
    expect(result.map((r) => r.id)).toEqual(['a']);
  });

  it('active: direct-only, online before away before offline', () => {
    const rows = [
      preview({ id: 'a', isOnline: false, isAway: false, latestMessageAt: '2026-07-12T09:00:00.000Z' }),
      preview({ id: 'b', isOnline: true, latestMessageAt: '2026-07-12T08:00:00.000Z' }),
      preview({ id: 'c', isAway: true, latestMessageAt: '2026-07-12T07:00:00.000Z' }),
      preview({ id: 'd', isGroup: true, isOnline: true }),
    ];
    const result = filterPreviewsForFilter(rows, 'active');
    expect(result.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('unread: falls back to all previews when none are unread', () => {
    const rows = [
      preview({ id: 'a', latestMessageAt: '2026-07-12T10:00:00.000Z' }),
      preview({ id: 'b', latestMessageAt: '2026-07-12T12:00:00.000Z' }),
    ];
    const result = filterPreviewsForFilter(rows, 'unread');
    expect(result.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('unread: returns only unread previews when present', () => {
    const rows = [
      preview({ id: 'a', isUnread: true, latestMessageAt: '2026-07-12T09:00:00.000Z' }),
      preview({ id: 'b', isUnread: false, latestMessageAt: '2026-07-12T12:00:00.000Z' }),
    ];
    const result = filterPreviewsForFilter(rows, 'unread');
    expect(result.map((r) => r.id)).toEqual(['a']);
  });
});
