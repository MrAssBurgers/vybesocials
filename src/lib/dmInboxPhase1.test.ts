import { describe, expect, it } from 'vitest';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { compareInboxPriority, computeInboxPriorityScore } from '@/lib/dmInboxPriority';
import { filterConversationsForTab, organizeDmInbox } from '@/lib/dmInboxOrganize';
import { conversationNeedsReply as needsReply } from '@/lib/dmNeedsReply';
import { maxReplaysForMode, viewModeToMediaMode } from '@/lib/dmMediaRules';
import { blendDmThemes, ensureReadableText } from '@/lib/dmThemeBlend';
import { buildCaptureEventKey, severityForEventType } from '@/lib/ScreenshotDetectionService';

const me = 'profile-me';

function member(overrides: {
  user_id?: string;
  role?: string;
  is_muted?: boolean;
  is_pinned?: boolean;
  last_read_at?: string | null;
  profile?: { id: string; username?: string; avatar_url?: string | null; display_name?: string | null } | null;
} = {}) {
  return {
    user_id: me,
    role: 'member',
    is_pinned: false,
    is_muted: false,
    last_read_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as LoadedDMConversation['members'][number];
}

function conv(id: string, overrides: Partial<LoadedDMConversation> = {}): LoadedDMConversation {
  return {
    id,
    is_group: false,
    name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    unread_count: 0,
    _sortTime: '2026-01-01T00:00:00.000Z',
    _hasUnread: false,
    members: [member()],
    last_message: null,
    ...overrides,
  };
}

describe('dmInboxPriority', () => {
  it('ranks unread above read with same recency', () => {
    const unread = conv('a', { unread_count: 2, _hasUnread: true });
    const read = conv('b');
    expect(compareInboxPriority(unread, read, me)).toBeLessThan(0);
  });

  it('pinned floats above non-pinned', () => {
    const pinned = conv('a', { members: [member({ is_pinned: true })] });
    const normal = conv('b', { unread_count: 5, _hasUnread: true });
    expect(compareInboxPriority(pinned, normal, me)).toBeLessThan(0);
  });

  it('adds needs-reply boost', () => {
    const needs = conv('a', {
      last_message: {
        id: 'm1',
        conversation_id: 'a',
        sender_id: 'other',
        content: 'hey',
        created_at: '2026-07-10T12:00:00.000Z',
        media_url: null,
        media_type: null,
        message_type: 'text',
        view_mode: 'permanent',
        expires_at: null,
        is_deleted: false,
        reply_to_id: null,
      },
      members: [member({ last_read_at: '2026-07-09T12:00:00.000Z' })],
    });
    const score = computeInboxPriorityScore({ conv: needs, profileId: me });
    expect(score).toBeGreaterThan(700);
  });
});

describe('dmInboxOrganize', () => {
  it('creates needs_reply section', () => {
    const row = conv('a', {
      last_message: {
        id: 'm1',
        conversation_id: 'a',
        sender_id: 'peer',
        content: 'ping',
        created_at: '2026-07-11T10:00:00.000Z',
        media_url: null,
        media_type: null,
        message_type: 'text',
        view_mode: 'permanent',
        expires_at: null,
        is_deleted: false,
        reply_to_id: null,
      },
    });
    expect(needsReply(row, me)).toBe(true);
    const sections = organizeDmInbox([row], me);
    expect(sections[0]?.id).toBe('needs_reply');
  });
});

describe('filterConversationsForTab', () => {
  const friend = conv('friend-1', {
    members: [
      member(),
      member({
        user_id: 'auth-peer',
        profile: {
          id: 'profile-peer',
          username: 'peer',
          avatar_url: null,
          display_name: 'Peer',
        },
      }),
    ],
  });
  const group = conv('group-1', { is_group: true });
  const unread = conv('unread-1', { unread_count: 2, _hasUnread: true });
  const requestThread = conv('request-1', {
    members: [
      member(),
      member({
        user_id: 'sender-auth',
        profile: {
          id: 'sender-profile',
          username: 'sender',
          avatar_url: null,
          display_name: 'Sender',
        },
      }),
    ],
  });

  const resolveOther = (c: LoadedDMConversation) => {
    const other = c.members?.find((m) => m.user_id !== me);
    return other?.profile?.id || other?.user_id;
  };

  it('friends excludes groups and request threads', () => {
    const rows = filterConversationsForTab([friend, group, requestThread], 'friends', {
      requestConversationIds: new Set(['request-1']),
    });
    expect(rows.map((r) => r.id)).toEqual(['friend-1']);
  });

  it('groups only returns group chats', () => {
    const rows = filterConversationsForTab([friend, group], 'groups');
    expect(rows.map((r) => r.id)).toEqual(['group-1']);
  });

  it('best_friends matches close friend profile ids', () => {
    const rows = filterConversationsForTab([friend, group], 'best_friends', {
      closeFriendIds: new Set(['profile-peer']),
      resolveOtherProfileId: resolveOther,
    });
    expect(rows.map((r) => r.id)).toEqual(['friend-1']);
  });

  it('best_friends is empty without close friends', () => {
    expect(
      filterConversationsForTab([friend], 'best_friends', {
        closeFriendIds: new Set(),
        resolveOtherProfileId: resolveOther,
      }),
    ).toEqual([]);
  });

  it('nearby matches nearby peer profile ids', () => {
    const rows = filterConversationsForTab([friend], 'nearby', {
      nearbyProfileIds: new Set(['profile-peer']),
      resolveOtherProfileId: resolveOther,
    });
    expect(rows.map((r) => r.id)).toEqual(['friend-1']);
  });

  it('unread includes unread and call conversation ids', () => {
    const callOnly = conv('call-1');
    const rows = filterConversationsForTab([friend, unread, callOnly], 'unread', {
      callConversationIds: new Set(['call-1']),
    });
    expect(rows.map((r) => r.id).sort()).toEqual(['call-1', 'unread-1']);
  });

  it('requests returns matched conversation ids', () => {
    const rows = filterConversationsForTab([friend, requestThread], 'requests', {
      requestConversationIds: new Set(['request-1']),
    });
    expect(rows.map((r) => r.id)).toEqual(['request-1']);
  });
});

describe('dmMediaRules', () => {
  it('maps replay_once view mode', () => {
    expect(viewModeToMediaMode('replay_once')).toBe('replay_once');
    expect(maxReplaysForMode('replay_once')).toBe(1);
  });
});

describe('dmThemeBlend', () => {
  it('ensureReadableText picks higher-contrast foreground', () => {
    const fg = ensureReadableText('262 83% 58%', '0 0% 12%');
    expect(['0 0% 100%', '0 0% 12%']).toContain(fg);
  });

  it('blend mode returns wallpaper', () => {
    const theme = blendDmThemes(
      { primary: '262 83% 58%', secondary: '280 60% 45%', accent: '320 70% 55%', background: '0 0% 7%' },
      { primary: '200 80% 50%', secondary: '210 40% 40%', accent: '190 70% 45%', background: '0 0% 7%' },
      'blend',
    );
    expect(theme.mode).toBe('blend');
    expect(theme.wallpaper).toBeTruthy();
  });
});

describe('ScreenshotDetectionService', () => {
  it('dedupes events within 5s bucket', () => {
    const a = buildCaptureEventKey({
      eventType: 'screenshot_chat',
      conversationId: 'c1',
      timestamp: 1000,
    });
    const b = buildCaptureEventKey({
      eventType: 'screenshot_chat',
      conversationId: 'c1',
      timestamp: 3000,
    });
    expect(a).toBe(b);
  });

  it('marks disappearing media as high severity', () => {
    expect(severityForEventType('screenshot_disappearing_photo')).toBe('high');
  });
});
