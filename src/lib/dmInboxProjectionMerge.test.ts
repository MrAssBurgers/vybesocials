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
});
