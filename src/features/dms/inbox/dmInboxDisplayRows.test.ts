import { describe, expect, it } from 'vitest';
import { resolveInboxDisplayRows } from './dmInboxDisplayRows';
import type { DMInboxRow } from '@/features/dms/dm.types';

function conversationRow(id: string): DMInboxRow {
  return {
    type: 'conversation',
    preview: {
      conversation: { id } as never,
      id,
      conversationId: id,
      conversationType: 'direct',
      displayName: id,
      previewText: 'hi',
      statusLine: 'hi',
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
    },
  };
}

describe('resolveInboxDisplayRows', () => {
  it('shows skeleton on initial load with no cache', () => {
    const result = resolveInboxDisplayRows({
      rows: [],
      lastStableRows: [],
      hasCachedRows: false,
      isFetching: true,
      isInitialLoad: true,
      fetchSettled: false,
    });
    expect(result.showSkeleton).toBe(true);
    expect(result.displayRows).toEqual([]);
    expect(result.listPhase).toBe('loading');
  });

  it('keeps stable rows visible during background refetch', () => {
    const stable = [conversationRow('a'), conversationRow('b')];
    const result = resolveInboxDisplayRows({
      rows: [],
      lastStableRows: stable,
      hasCachedRows: true,
      isFetching: true,
      isInitialLoad: false,
      fetchSettled: true,
    });
    expect(result.displayRows).toEqual(stable);
    expect(result.showSkeleton).toBe(false);
    expect(result.showEmpty).toBe(false);
    expect(result.listPhase).toBe('cached');
    expect(result.rejectedPartial).toBe(true);
  });

  it('rejects partial shrink during fetch and patches by conversationId', () => {
    const stable = [conversationRow('a'), conversationRow('b'), conversationRow('c')];
    const partial = [conversationRow('a'), conversationRow('c')];
    const result = resolveInboxDisplayRows({
      rows: partial,
      lastStableRows: stable,
      hasCachedRows: true,
      isFetching: true,
      isInitialLoad: false,
      fetchSettled: true,
    });
    expect(result.displayRows).toHaveLength(3);
    expect(
      result.displayRows.map((r) =>
        r.type === 'conversation' ? r.preview.conversationId : '',
      ),
    ).toEqual(['a', 'b', 'c']);
    expect(result.rejectedPartial).toBe(true);
  });

  it('rejects partial shrink while projection hydrates', () => {
    const stable = [conversationRow('a'), conversationRow('b')];
    const result = resolveInboxDisplayRows({
      rows: [conversationRow('a')],
      lastStableRows: stable,
      hasCachedRows: true,
      isFetching: false,
      isInitialLoad: false,
      fetchSettled: true,
      projectionHydrating: true,
    });
    expect(result.displayRows).toHaveLength(2);
    expect(result.rejectedPartial).toBe(true);
  });

  it('shows empty only after fetch settles with no rows', () => {
    const result = resolveInboxDisplayRows({
      rows: [],
      lastStableRows: [],
      hasCachedRows: false,
      isFetching: false,
      isInitialLoad: false,
      fetchSettled: true,
    });
    expect(result.showEmpty).toBe(true);
    expect(result.listPhase).toBe('empty');
  });

  it('prefers incoming rows when present and not a partial shrink', () => {
    const stable = [conversationRow('old')];
    const incoming = [conversationRow('new')];
    const result = resolveInboxDisplayRows({
      rows: incoming,
      lastStableRows: stable,
      hasCachedRows: true,
      isFetching: false,
      isInitialLoad: false,
      fetchSettled: true,
    });
    expect(result.displayRows).toEqual(incoming);
    expect(result.lastStableRows).toEqual(incoming);
  });
});
