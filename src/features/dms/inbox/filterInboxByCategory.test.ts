import { describe, expect, it } from 'vitest';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { buildInboxConversationIndex } from './buildInboxConversationIndex';
import { filterInboxByCategory } from './filterInboxByCategory';
import { buildInboxCategoryCounts } from './inboxCategoryCounts';
import { inboxOrderFingerprint } from '@/lib/sortInboxConversations';

function conv(
  id: string,
  opts: Partial<LoadedDMConversation> & { otherId?: string; pinned?: boolean; pinOrder?: number } = {},
): LoadedDMConversation {
  const otherId = opts.otherId ?? `peer-${id}`;
  return {
    id,
    is_group: opts.is_group ?? false,
    unread_count: opts.unread_count ?? 0,
    _hasUnread: opts._hasUnread ?? false,
    _sortTime: opts._sortTime ?? '2026-07-13T12:00:00.000Z',
    updated_at: opts.updated_at ?? '2026-07-13T12:00:00.000Z',
    members: opts.members ?? [
      {
        user_id: 'me',
        is_pinned: opts.pinned ?? false,
        pin_order: opts.pinOrder,
        profile: { id: 'me' },
      },
      { user_id: otherId, profile: { id: otherId, username: otherId } },
    ],
    last_message: opts.last_message ?? {
      id: `m-${id}`,
      conversation_id: id,
      sender_id: otherId,
      content: 'hi',
      created_at: opts._sortTime ?? '2026-07-13T12:00:00.000Z',
    },
    ...opts,
  } as LoadedDMConversation;
}

function buildIndex(
  conversations: LoadedDMConversation[],
  extras: Partial<Parameters<typeof buildInboxConversationIndex>[0]> = {},
) {
  return buildInboxConversationIndex({
    conversations,
    profileId: 'me',
    storyStateByProfileId: extras.storyStateByProfileId ?? new Map(),
    streakMap: extras.streakMap ?? new Map(),
    callSummaries: extras.callSummaries ?? new Map(),
    nearbyProfileIds: extras.nearbyProfileIds ?? new Set(),
    closeFriendIds: extras.closeFriendIds ?? new Set(),
    rankedBestFriendIds: extras.rankedBestFriendIds ?? new Set(),
    presenceOnlineIds: extras.presenceOnlineIds ?? new Set(),
    resolveOtherProfileId: (c) =>
      c.is_group
        ? undefined
        : c.members?.find((m) => m.user_id !== 'me')?.profile?.id
          ? String(c.members.find((m) => m.user_id !== 'me')?.profile?.id)
          : undefined,
    ...extras,
  });
}

describe('filterInboxByCategory', () => {
  it('sorts Chat (all) by pin then latest_message_at', () => {
    const index = buildIndex([
      conv('a', { _sortTime: '2026-07-13T10:00:00.000Z' }),
      conv('b', { _sortTime: '2026-07-13T14:00:00.000Z' }),
      conv('pin', {
        _sortTime: '2026-07-13T08:00:00.000Z',
        pinned: true,
        pinOrder: 1,
      }),
    ]);
    const filtered = filterInboxByCategory(index, null, 'me');
    expect(filtered.map((e) => e.conversationId)).toEqual(['pin', 'b', 'a']);
  });

  it('hard-filters Unread and sorts by latest_message_at', () => {
    const index = buildIndex([
      conv('read', { unread_count: 0, _sortTime: '2026-07-13T15:00:00.000Z' }),
      conv('unread-old', {
        unread_count: 2,
        _sortTime: '2026-07-13T11:00:00.000Z',
      }),
      conv('unread-new', {
        unread_count: 1,
        _sortTime: '2026-07-13T13:00:00.000Z',
      }),
    ]);
    const filtered = filterInboxByCategory(index, 'unread', 'me');
    expect(filtered.map((e) => e.conversationId)).toEqual(['unread-new', 'unread-old']);
    expect(filtered.every((e) => e.categoryMatch)).toBe(true);
  });

  it('Best Friends ordered by latest_message_at, not rank', () => {
    const index = buildIndex(
      [
        conv('low', { otherId: 'u-low', _sortTime: '2026-07-13T15:00:00.000Z' }),
        conv('high', { otherId: 'u-high', _sortTime: '2026-07-13T10:00:00.000Z' }),
      ],
      {
        rankedBestFriendIds: new Set(['u-low', 'u-high']),
        bestFriendRankByProfileId: new Map([
          ['u-high', 1],
          ['u-low', 8],
        ]),
      },
    );
    const filtered = filterInboxByCategory(index, 'best-friends', 'me');
    expect(filtered.map((e) => e.conversationId)).toEqual(['low', 'high']);
  });

  it('Active filter membership changes with presence without reordering survivors by online score', () => {
    const rows = [
      conv('a', { otherId: 'u-a', _sortTime: '2026-07-13T14:00:00.000Z' }),
      conv('b', { otherId: 'u-b', _sortTime: '2026-07-13T10:00:00.000Z' }),
      conv('c', { otherId: 'u-c', _sortTime: '2026-07-13T12:00:00.000Z' }),
    ];
    const online = filterInboxByCategory(
      buildIndex(rows, { presenceOnlineIds: new Set(['u-a', 'u-b', 'u-c']) }),
      'active',
      'me',
    );
    expect(online.map((e) => e.conversationId)).toEqual(['a', 'c', 'b']);

    const fewerOnline = filterInboxByCategory(
      buildIndex(rows, { presenceOnlineIds: new Set(['u-b', 'u-c']) }),
      'active',
      'me',
    );
    expect(fewerOnline.map((e) => e.conversationId)).toEqual(['c', 'b']);
  });

  it('stories filter uses chronological order, not unviewed boost', () => {
    const index = buildIndex(
      [
        conv('viewed', { otherId: 'u1', _sortTime: '2026-07-13T14:00:00.000Z' }),
        conv('fresh', { otherId: 'u2', _sortTime: '2026-07-13T09:00:00.000Z' }),
      ],
      {
        storyStateByProfileId: new Map([
          ['u1', 'viewed'],
          ['u2', 'unviewed'],
        ]),
      },
    );
    const filtered = filterInboxByCategory(index, 'stories', 'me');
    expect(filtered.map((e) => e.conversationId)).toEqual(['viewed', 'fresh']);
  });

  it('does not reorder Chat when unread flags flip on the same message times', () => {
    const base = [
      conv('a', { unread_count: 0, _sortTime: '2026-07-13T14:00:00.000Z' }),
      conv('b', { unread_count: 0, _sortTime: '2026-07-13T10:00:00.000Z' }),
    ];
    const before = inboxOrderFingerprint(
      filterInboxByCategory(buildIndex(base), null, 'me').map((e) => e.conversationId),
    );
    const after = filterInboxByCategory(
      buildIndex([
        { ...base[0], unread_count: 3, _hasUnread: true },
        base[1],
      ]),
      null,
      'me',
    );
    expect(inboxOrderFingerprint(after.map((e) => e.conversationId))).toBe(before);
  });
});

describe('buildInboxCategoryCounts', () => {
  it('counts unread, groups, and active', () => {
    const index = buildIndex(
      [
        conv('a', { unread_count: 1, otherId: 'u-a' }),
        conv('b', { is_group: true }),
        conv('c', { otherId: 'u-c' }),
      ],
      { presenceOnlineIds: new Set(['u-a', 'u-c']) },
    );
    const counts = buildInboxCategoryCounts({ index, pendingRequestCount: 2 });
    expect(counts.unread).toBe(1);
    expect(counts.groups).toBe(1);
    expect(counts.active).toBe(2);
    expect(counts.new).toBe(2);
  });
});
