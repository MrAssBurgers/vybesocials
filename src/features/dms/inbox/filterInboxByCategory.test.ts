import { describe, expect, it } from 'vitest';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { buildInboxConversationIndex } from './buildInboxConversationIndex';
import { filterInboxByCategory } from './filterInboxByCategory';
import { buildInboxCategoryCounts } from './inboxCategoryCounts';

function conv(
  id: string,
  opts: Partial<LoadedDMConversation> & { otherId?: string } = {},
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
      { user_id: 'me', profile: { id: 'me' } },
      { user_id: otherId, profile: { id: otherId, username: otherId } },
    ],
    last_message: opts.last_message,
    ...opts,
  } as LoadedDMConversation;
}

function buildIndex(conversations: LoadedDMConversation[], extras: Partial<Parameters<typeof buildInboxConversationIndex>[0]> = {}) {
  return buildInboxConversationIndex({
    conversations,
    profileId: 'me',
    storyStateByProfileId: extras.storyStateByProfileId ?? new Map(),
    streakMap: extras.streakMap ?? new Map(),
    callSummaries: extras.callSummaries ?? new Map(),
    nearbyProfileIds: extras.nearbyProfileIds ?? new Set(),
    closeFriendIds: extras.closeFriendIds ?? new Set(),
    rankedBestFriendIds: extras.rankedBestFriendIds ?? new Set(),
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
  it('sorts all conversations by recency', () => {
    const index = buildIndex([
      conv('a', { _sortTime: '2026-07-13T10:00:00.000Z' }),
      conv('b', { _sortTime: '2026-07-13T14:00:00.000Z' }),
    ]);
    const filtered = filterInboxByCategory(index, null, 'me');
    expect(filtered.map((e) => e.conversationId)).toEqual(['b', 'a']);
    expect(filtered.every((e) => e.categoryMatch)).toBe(true);
  });

  it('soft-dims unread: matches first, non-matches after', () => {
    const index = buildIndex([
      conv('read', { unread_count: 0 }),
      conv('unread', { unread_count: 2, _sortTime: '2026-07-13T11:00:00.000Z' }),
    ]);
    const filtered = filterInboxByCategory(index, 'unread', 'me');
    expect(filtered[0].conversationId).toBe('unread');
    expect(filtered[0].categoryMatch).toBe(true);
    expect(filtered[1].conversationId).toBe('read');
    expect(filtered[1].categoryMatch).toBe(false);
  });

  it('filters groups only in match set', () => {
    const index = buildIndex([
      conv('dm', { is_group: false }),
      conv('grp', { is_group: true }),
    ]);
    const filtered = filterInboxByCategory(index, 'groups', 'me');
    expect(filtered.filter((e) => e.categoryMatch).map((e) => e.conversationId)).toEqual(['grp']);
  });

  it('prioritizes unviewed stories in stories category', () => {
    const index = buildIndex(
      [
        conv('viewed', { otherId: 'u1' }),
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
    expect(filtered[0].conversationId).toBe('fresh');
    expect(filtered[0].categoryMatch).toBe(true);
  });
});

describe('buildInboxCategoryCounts', () => {
  it('counts unread and groups', () => {
    const index = buildIndex([
      conv('a', { unread_count: 1 }),
      conv('b', { is_group: true }),
    ]);
    const counts = buildInboxCategoryCounts({ index, pendingRequestCount: 2 });
    expect(counts.unread).toBe(1);
    expect(counts.groups).toBe(1);
    expect(counts.new).toBe(2);
  });
});
