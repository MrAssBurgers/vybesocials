import { describe, expect, it } from 'vitest';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { compareInboxPriority, computeInboxPriorityScore } from '@/lib/dmInboxPriority';
import { organizeDmInbox } from '@/lib/dmInboxOrganize';
import { conversationNeedsReply as needsReply } from '@/lib/dmNeedsReply';
import { maxReplaysForMode, viewModeToMediaMode } from '@/lib/dmMediaRules';
import { blendDmThemes, contrastRatioFgOnBg, ensureReadableText } from '@/lib/dmThemeBlend';
import { buildCaptureEventKey, severityForEventType } from '@/lib/ScreenshotDetectionService';

const me = 'profile-me';

function conv(id: string, overrides: Partial<LoadedDMConversation> = {}): LoadedDMConversation {
  return {
    id,
    is_group: false,
    name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    unread_count: 0,
    _hasUnread: false,
    members: [{ user_id: me, is_pinned: false, is_muted: false }],
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
    const pinned = conv('a', { members: [{ user_id: me, is_pinned: true }] });
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
      members: [{ user_id: me, last_read_at: '2026-07-09T12:00:00.000Z' }],
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
