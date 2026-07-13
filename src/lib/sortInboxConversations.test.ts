import { describe, expect, it } from 'vitest';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import {
  inboxOrderFingerprint,
  sortInboxConversations,
  sortInboxPreviews,
  compareInboxSortables,
} from '@/lib/sortInboxConversations';
import type { DMConversationPreview } from '@/features/dms/dm.types';

const ME = 'me';

function conv(
  id: string,
  opts: Partial<LoadedDMConversation> & {
    pinned?: boolean;
    pinOrder?: number;
    at?: string;
    unread?: number;
  } = {},
): LoadedDMConversation {
  const members = opts.members ?? [
    {
      user_id: ME,
      is_pinned: opts.pinned ?? false,
      pin_order: opts.pinOrder,
    } as never,
  ];
  return {
    id,
    is_group: false,
    members,
    unread_count: opts.unread ?? 0,
    _hasUnread: (opts.unread ?? 0) > 0,
    _sortTime: opts.at ?? '2026-07-13T12:00:00.000Z',
    updated_at: opts.at ?? '2026-07-13T12:00:00.000Z',
    last_message: opts.last_message ?? {
      id: `m-${id}`,
      conversation_id: id,
      sender_id: 'peer',
      content: 'hi',
      created_at: opts.at ?? '2026-07-13T12:00:00.000Z',
    },
    ...opts,
  } as LoadedDMConversation;
}

function preview(
  id: string,
  opts: Partial<DMConversationPreview> = {},
): DMConversationPreview {
  return {
    conversation: conv(id),
    id,
    conversationId: id,
    conversationType: 'direct',
    displayName: id,
    previewText: 'hi',
    statusLine: '',
    statusKind: 'none',
    deliveryStatus: 'sent',
    latestMessageType: 'text',
    latestMessageAt: '2026-07-13T12:00:00.000Z',
    unreadCount: 0,
    mentionCount: 0,
    isUnread: false,
    isPinned: false,
    pinOrder: 9999,
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
    ...opts,
  } as DMConversationPreview;
}

describe('sortInboxConversations', () => {
  it('orders by latest message activity', () => {
    const sorted = sortInboxConversations(
      [
        conv('a', { at: '2026-07-13T10:00:00.000Z' }),
        conv('b', { at: '2026-07-13T14:00:00.000Z' }),
      ],
      ME,
    );
    expect(sorted.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('keeps pinned above newer unpinned chats', () => {
    const sorted = sortInboxConversations(
      [
        conv('recent', { at: '2026-07-13T18:00:00.000Z' }),
        conv('pinned', { at: '2026-01-01T00:00:00.000Z', pinned: true, pinOrder: 1 }),
      ],
      ME,
    );
    expect(sorted.map((c) => c.id)).toEqual(['pinned', 'recent']);
  });

  it('keeps pinOrder stable among pinned chats', () => {
    const sorted = sortInboxConversations(
      [
        conv('p2', { pinned: true, pinOrder: 2, at: '2026-07-13T18:00:00.000Z' }),
        conv('p1', { pinned: true, pinOrder: 1, at: '2026-07-13T10:00:00.000Z' }),
      ],
      ME,
    );
    expect(sorted.map((c) => c.id)).toEqual(['p1', 'p2']);
  });

  it('uses conversationId as a stable tie-breaker', () => {
    const at = '2026-07-13T12:00:00.000Z';
    const sorted = sortInboxConversations(
      [conv('zeta', { at }), conv('alpha', { at })],
      ME,
    );
    expect(sorted.map((c) => c.id)).toEqual(['alpha', 'zeta']);
  });

  it('does not move rows when unread changes', () => {
    const base = [
      conv('a', { at: '2026-07-13T14:00:00.000Z', unread: 0 }),
      conv('b', { at: '2026-07-13T10:00:00.000Z', unread: 0 }),
    ];
    const before = inboxOrderFingerprint(sortInboxConversations(base, ME).map((c) => c.id));
    const afterUnread = sortInboxConversations(
      [
        { ...base[0], unread_count: 9, _hasUnread: true },
        { ...base[1], unread_count: 0, _hasUnread: false },
      ],
      ME,
    );
    expect(inboxOrderFingerprint(afterUnread.map((c) => c.id))).toBe(before);
  });

  it('does not move rows when presence/typing/relationship fields change on previews', () => {
    const rows = [
      preview('a', { latestMessageAt: '2026-07-13T14:00:00.000Z' }),
      preview('b', { latestMessageAt: '2026-07-13T10:00:00.000Z' }),
    ];
    const before = inboxOrderFingerprint(sortInboxPreviews(rows).map((r) => r.conversationId));
    const after = sortInboxPreviews([
      {
        ...rows[0],
        isTyping: true,
        isOnline: true,
        unreadCount: 5,
        isUnread: true,
        streakCount: 99,
        relationshipEmoji: '💜',
        presenceState: 'online',
      },
      {
        ...rows[1],
        isTyping: false,
        isOnline: false,
        streakCount: 0,
      },
    ]);
    expect(inboxOrderFingerprint(after.map((r) => r.conversationId))).toBe(before);
  });

  it('moves only the conversation that received a new message', () => {
    const a = conv('a', { at: '2026-07-13T14:00:00.000Z' });
    const b = conv('b', { at: '2026-07-13T10:00:00.000Z' });
    const c = conv('c', { at: '2026-07-13T12:00:00.000Z' });
    expect(sortInboxConversations([a, b, c], ME).map((x) => x.id)).toEqual(['a', 'c', 'b']);

    const bAfter = conv('b', { at: '2026-07-13T15:00:00.000Z' });
    expect(sortInboxConversations([a, bAfter, c], ME).map((x) => x.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('profile / projection display patches do not reorder', () => {
    const rows = [
      preview('a', { latestMessageAt: '2026-07-13T14:00:00.000Z', displayName: 'Alex' }),
      preview('b', { latestMessageAt: '2026-07-13T10:00:00.000Z', displayName: 'Bea' }),
    ];
    const before = inboxOrderFingerprint(sortInboxPreviews(rows).map((r) => r.conversationId));
    const after = sortInboxPreviews([
      { ...rows[0], displayName: 'Alexander', avatarUrl: 'https://x/y.jpg', fromProjection: true },
      { ...rows[1], displayName: 'Beatrice', storyState: 'unviewed' },
    ]);
    expect(inboxOrderFingerprint(after.map((r) => r.conversationId))).toBe(before);
  });

  it('ignores volatile fields in compareInboxSortables', () => {
    expect(
      compareInboxSortables(
        { conversationId: 'a', isPinned: false, pinOrder: 9999, latestMessageAt: '2026-07-13T12:00:00.000Z' },
        { conversationId: 'b', isPinned: false, pinOrder: 9999, latestMessageAt: '2026-07-13T12:00:00.000Z' },
      ),
    ).toBeLessThan(0);
  });
});
