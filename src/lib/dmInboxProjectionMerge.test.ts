import { describe, expect, it } from 'vitest';
import { mergeLegacyAndProjection } from './dmInboxProjectionMerge';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import type { DmInboxEntryDoc } from '@/features/dms/dm.types';

function legacy(id: string): LoadedDMConversation {
  return {
    id,
    is_group: false,
    unread_count: 0,
    members: [],
    last_message: null,
  } as LoadedDMConversation;
}

function projectionEntry(id: string): DmInboxEntryDoc {
  return {
    conversation_id: id,
    viewer_id: 'viewer',
    is_group: false,
    unread_count: 1,
    updated_at: '2026-01-01T00:00:00Z',
  } as DmInboxEntryDoc;
}

describe('mergeLegacyAndProjection', () => {
  it('returns legacy when projection read is disabled', () => {
    const result = mergeLegacyAndProjection({
      legacy: [legacy('a'), legacy('b')],
      projectionEntries: [projectionEntry('c')],
      lockedIds: new Set(),
      projectionReadEnabled: false,
      projectionReady: true,
    });
    expect(result.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('keeps legacy rows when projection is not ready', () => {
    const result = mergeLegacyAndProjection({
      legacy: [legacy('a')],
      projectionEntries: [],
      lockedIds: new Set(),
      projectionReadEnabled: true,
      projectionReady: false,
    });
    expect(result.map((c) => c.id)).toEqual(['a']);
  });

  it('patches projection onto legacy order without reordering', () => {
    const result = mergeLegacyAndProjection({
      legacy: [legacy('a'), legacy('b')],
      projectionEntries: [projectionEntry('a'), projectionEntry('c')],
      lockedIds: new Set(),
      projectionReadEnabled: true,
      projectionReady: true,
    });
    // Legacy order preserved: a, b — then projection-only c appended
    expect(result.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(result[0].unread_count).toBe(1);
  });

  it('filters locked ids from both sources', () => {
    const result = mergeLegacyAndProjection({
      legacy: [legacy('a'), legacy('b')],
      projectionEntries: [projectionEntry('b'), projectionEntry('c')],
      lockedIds: new Set(['b']),
      projectionReadEnabled: true,
      projectionReady: true,
    });
    expect(result.map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('does not bump sort clock from projection.updated_at alone', () => {
    const base = {
      id: 'a',
      is_group: false,
      unread_count: 0,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
      members: [],
      last_message: {
        id: 'm1',
        conversation_id: 'a',
        sender_id: 'peer',
        content: 'hi',
        created_at: '2026-07-13T10:00:00.000Z',
      },
      _sortTime: '2026-07-13T10:00:00.000Z',
    } as LoadedDMConversation;

    const result = mergeLegacyAndProjection({
      legacy: [base],
      projectionEntries: [
        {
          conversation_id: 'a',
          viewer_id: 'viewer',
          conversation_type: 'direct',
          display_name: 'Alex',
          preview_text: 'hi',
          unread_count: 2,
          is_unread: true,
          is_pinned: false,
          is_muted: false,
          needs_reply: false,
          latest_message_id: 'm1',
          latest_message_at: '2026-07-13T10:00:00.000Z',
          updated_at: '2026-07-13T22:00:00.000Z',
        } as DmInboxEntryDoc,
      ],
      lockedIds: new Set(),
      projectionReadEnabled: true,
      projectionReady: true,
    });

    expect(result[0].last_message?.created_at).toBe('2026-07-13T10:00:00.000Z');
    expect(result[0]._sortTime).toBe('2026-07-13T10:00:00.000Z');
    expect(result[0].unread_count).toBe(2);
  });

  it('does not append projection-only 1:1 rows for a peer already in legacy', () => {
    const legacyPeer = {
      id: 'conv-a',
      is_group: false,
      unread_count: 0,
      members: [
        { user_id: 'viewer', role: 'member' },
        {
          user_id: 'peer-1',
          role: 'member',
          profile: { id: 'peer-1', username: 'alex' },
        },
      ],
      last_message: null,
    } as LoadedDMConversation;

    const result = mergeLegacyAndProjection({
      legacy: [legacyPeer],
      projectionEntries: [
        {
          conversation_id: 'conv-a',
          viewer_id: 'viewer',
          conversation_type: 'direct',
          other_profile_id: 'peer-1',
          username: 'alex',
          unread_count: 0,
          updated_at: '2026-01-01T00:00:00Z',
        } as DmInboxEntryDoc,
        {
          conversation_id: 'conv-dup',
          viewer_id: 'viewer',
          conversation_type: 'direct',
          other_profile_id: 'peer-1',
          username: 'alex',
          unread_count: 1,
          updated_at: '2026-01-02T00:00:00Z',
        } as DmInboxEntryDoc,
      ],
      lockedIds: new Set(),
      projectionReadEnabled: true,
      projectionReady: true,
      viewerId: 'viewer',
    });

    expect(result.map((c) => c.id)).toEqual(['conv-a']);
  });
});
