import { describe, expect, it } from 'vitest';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import {
  compareDmConversations,
  getDmConversationSortTime,
  patchDmConversationActivity,
  sortDmConversations,
} from '@/lib/dmConversationSort';

const profileId = 'profile-me';

function makeConv(
  id: string,
  overrides: Partial<LoadedDMConversation> = {},
): LoadedDMConversation {
  const created = overrides.created_at ?? '2026-01-01T00:00:00.000Z';
  return {
    id,
    is_group: false,
    name: null,
    avatar_url: null,
    created_at: created,
    updated_at: overrides.updated_at ?? created,
    members: overrides.members,
    last_message: overrides.last_message ?? null,
    unread_count: overrides.unread_count ?? 0,
    _sortTime: overrides._sortTime ?? created,
    _hasUnread: overrides._hasUnread ?? false,
    ...overrides,
  };
}

describe('getDmConversationSortTime', () => {
  it('uses last_message.created_at and ignores updated_at', () => {
    const conv = makeConv('a', {
      updated_at: '2026-07-04T12:00:00.000Z',
      last_message: {
        id: 'm1',
        conversation_id: 'a',
        sender_id: 'other',
        content: 'hi',
        media_url: null,
        media_type: null,
        message_type: 'text',
        view_mode: 'permanent',
        expires_at: null,
        is_deleted: false,
        reply_to_id: null,
        created_at: '2026-06-01T08:00:00.000Z',
      },
    });

    expect(getDmConversationSortTime(conv)).toBe('2026-06-01T08:00:00.000Z');
  });
});

describe('compareDmConversations', () => {
  it('does not reorder when only unread state changes', () => {
    const base = makeConv('a', {
      last_message: {
        id: 'm-a',
        conversation_id: 'a',
        sender_id: 'other',
        content: 'hi',
        media_url: null,
        media_type: null,
        message_type: 'text',
        view_mode: 'permanent',
        expires_at: null,
        is_deleted: false,
        reply_to_id: null,
        created_at: '2026-06-15T10:00:00.000Z',
      },
      _sortTime: '2026-06-15T10:00:00.000Z',
      _hasUnread: true,
    });
    const read = { ...base, _hasUnread: false, unread_count: 0 };
    const other = makeConv('b', {
      last_message: {
        id: 'm-b',
        conversation_id: 'b',
        sender_id: 'other',
        content: 'yo',
        media_url: null,
        media_type: null,
        message_type: 'text',
        view_mode: 'permanent',
        expires_at: null,
        is_deleted: false,
        reply_to_id: null,
        created_at: '2026-06-20T10:00:00.000Z',
      },
      _sortTime: '2026-06-20T10:00:00.000Z',
      _hasUnread: false,
    });

    expect(compareDmConversations(base, other, profileId)).toBeGreaterThan(0);
    expect(compareDmConversations(read, other, profileId)).toBeGreaterThan(0);
  });

  it('sorts by newer last message activity', () => {
    const older = makeConv('old', {
      updated_at: '2026-07-04T12:00:00.000Z',
      last_message: {
        id: 'm-old',
        conversation_id: 'old',
        sender_id: 'other',
        content: 'old',
        media_url: null,
        media_type: null,
        message_type: 'text',
        view_mode: 'permanent',
        expires_at: null,
        is_deleted: false,
        reply_to_id: null,
        created_at: '2026-06-01T08:00:00.000Z',
      },
    });
    const newer = makeConv('new', {
      updated_at: '2026-01-01T00:00:00.000Z',
      last_message: {
        id: 'm-new',
        conversation_id: 'new',
        sender_id: profileId,
        content: 'sent',
        media_url: null,
        media_type: null,
        message_type: 'text',
        view_mode: 'permanent',
        expires_at: null,
        is_deleted: false,
        reply_to_id: null,
        created_at: '2026-07-04T11:00:00.000Z',
      },
    });

    const sorted = sortDmConversations([older, newer], profileId);
    expect(sorted[0].id).toBe('new');
  });

  it('keeps pinned conversations above unpinned', () => {
    const pinned = makeConv('pinned', {
      _sortTime: '2026-01-01T00:00:00.000Z',
      members: [{ user_id: profileId, role: 'member', is_muted: false, is_pinned: true, last_read_at: null }],
    });
    const recent = makeConv('recent', {
      _sortTime: '2026-07-04T12:00:00.000Z',
    });

    const sorted = sortDmConversations([recent, pinned], profileId);
    expect(sorted[0].id).toBe('pinned');
  });
});

describe('patchDmConversationActivity', () => {
  it('bumps sort time only from message activity', () => {
    const conv = makeConv('a', { _sortTime: '2026-01-01T00:00:00.000Z' });
    const patched = patchDmConversationActivity(conv, {
      id: 'm1',
      content: 'yo',
      media_type: null,
      media_url: null,
      message_type: 'text',
      created_at: '2026-07-04T12:00:00.000Z',
      sender_id: profileId,
    });

    expect(patched._sortTime).toBe('2026-07-04T12:00:00.000Z');
    expect(patched.last_message?.content).toBe('yo');
  });
});
