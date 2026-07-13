import { describe, expect, it } from 'vitest';
import {
  compareDmInboxShadow,
  shadowReadLooksHealthy,
  summarizeDmInboxShadow,
} from '@/lib/dmInboxShadowCompare';
import type { DmInboxEntryDoc } from '@/features/dms/dm.types';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { mapInboxEntryDoc, projectionToLoadedConversation } from '@/lib/dmInboxProjection';

function entry(partial: Partial<DmInboxEntryDoc> & { conversation_id: string }): DmInboxEntryDoc {
  return {
    viewer_id: 'me',
    conversation_type: 'direct',
    display_name: 'Alex',
    preview_text: 'hey',
    unread_count: 0,
    is_unread: false,
    is_pinned: false,
    is_muted: false,
    needs_reply: false,
    latest_message_at: '2026-07-12T12:00:00.000Z',
    ...partial,
  };
}

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

describe('dm inbox projection mapping', () => {
  it('maps firestore docs and builds conversation stubs', () => {
    const mapped = mapInboxEntryDoc('me_c1', {
      viewer_id: 'me',
      conversation_id: 'c1',
      conversation_type: 'group',
      display_name: 'Crew',
      preview_text: 'hi',
      unread_count: 2,
      is_unread: true,
      is_pinned: true,
      is_muted: false,
      needs_reply: false,
      is_archived: false,
      latest_message_at: '2026-07-12T10:00:00.000Z',
    });
    expect(mapped.conversation_type).toBe('group');
    expect(mapped.unread_count).toBe(2);

    const loaded = projectionToLoadedConversation(mapped);
    expect(loaded.id).toBe('c1');
    expect(loaded.is_group).toBe(true);
    expect(loaded._hasUnread).toBe(true);
  });
});

describe('dm inbox shadow compare', () => {
  it('reports missing projection rows and unread mismatches', () => {
    const projection = [entry({ conversation_id: 'a', unread_count: 1, is_unread: true })];
    const legacy = [
      conv({ id: 'a', unread_count: 0, _hasUnread: false }),
      conv({ id: 'b' }),
    ];
    const diff = compareDmInboxShadow(projection, legacy, 'me');
    expect(diff.missingInProjection).toEqual(['b']);
    expect(diff.unreadMismatch).toEqual(['a']);
    expect(shadowReadLooksHealthy(diff)).toBe(false);
    expect(summarizeDmInboxShadow(diff)).toContain('missingProjection=1');
  });

  it('passes when lists align', () => {
    const projection = [
      entry({ conversation_id: 'a', latest_message_at: '2026-07-12T12:00:00.000Z' }),
      entry({ conversation_id: 'b', latest_message_at: '2026-07-12T11:00:00.000Z' }),
    ];
    const legacy = [
      conv({
        id: 'a',
        _sortTime: '2026-07-12T12:00:00.000Z',
        last_message: {
          id: 'm1',
          conversation_id: 'a',
          sender_id: 'x',
          content: 'hey',
          created_at: '2026-07-12T12:00:00.000Z',
        } as LoadedDMConversation['last_message'],
      }),
      conv({ id: 'b', _sortTime: '2026-07-12T11:00:00.000Z' }),
    ];
    const diff = compareDmInboxShadow(projection, legacy, 'me');
    expect(diff.missingInProjection).toEqual([]);
    expect(shadowReadLooksHealthy(diff)).toBe(true);
  });
});
