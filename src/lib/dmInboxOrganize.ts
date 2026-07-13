import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import type { DMConversationPreview, DmInboxFilterId } from '@/features/dms/dm.types';
import { conversationNeedsReply } from '@/lib/dmNeedsReply';
import { safeDmMembers, ensureArray, ensureStringSet, safeSetHas } from '@/lib/persistedCollections';
import {
  sortInboxConversations,
  sortInboxPreviews,
  compareInboxSortables,
  toInboxSortable,
} from '@/lib/sortInboxConversations';

/** @deprecated Section headers removed in redesign — kept for type compatibility. */
export type DmInboxSectionId =
  | 'needs_reply'
  | 'unread'
  | 'pinned'
  | 'recent'
  | 'all';

export type DmInboxTabId =
  | DmInboxFilterId
  | 'friends'
  | 'best_friends'
  | 'nearby'
  | 'requests';

export const DM_INBOX_FILTERS: DmInboxFilterId[] = [
  'all',
  'unread',
  'needs_reply',
  'groups',
  'pinned',
  'active',
];

export const DM_INBOX_FILTER_LABELS: Record<DmInboxFilterId, string> = {
  all: 'All',
  unread: 'Unread',
  needs_reply: 'Needs Reply',
  groups: 'Groups',
  pinned: 'Pinned',
  active: 'Active',
};

export interface DmInboxSection {
  id: DmInboxSectionId;
  label: string;
  conversations: LoadedDMConversation[];
}

export interface DmInboxTabFilterOptions {
  profileId?: string;
  requestConversationIds?: Set<string>;
  callConversationIds?: Set<string>;
  closeFriendIds?: Set<string>;
  /** Server-ranked top-8 best friends (replaces close_friends when flag on). */
  rankedBestFriendIds?: Set<string>;
  nearbyProfileIds?: Set<string>;
  resolveOtherProfileId?: (conversation: LoadedDMConversation) => string | undefined;
  presenceOnlineIds?: Set<string>;
  recentlyActiveIds?: Set<string>;
}

function isPinnedForViewer(conv: LoadedDMConversation, profileId?: string): boolean {
  if (!profileId) return false;
  return Boolean(
    safeDmMembers(conv.members).find((m) => m.user_id === profileId)?.is_pinned,
  );
}

export function isMutedForViewer(conv: LoadedDMConversation, profileId?: string): boolean {
  if (!profileId) return false;
  return Boolean(
    safeDmMembers(conv.members).find((m) => m.user_id === profileId)?.is_muted,
  );
}

export function isNoiseLatest(conv: LoadedDMConversation): boolean {
  const type = String(
    conv.last_message?.message_type || conv.last_message?.media_type || 'text',
  ).toLowerCase();
  if (['system', 'reaction', 'call', 'missed_call'].includes(type)) return true;
  if (conv.last_message?.is_deleted) return true;
  return false;
}

/**
 * Snapchat-stable order: pinned (pinOrder) → latest message → conversationId.
 * Unread / presence / rank must never affect this comparator.
 */
export function compareInboxActivity(
  a: LoadedDMConversation,
  b: LoadedDMConversation,
  profileId?: string,
): number {
  return compareInboxSortables(toInboxSortable(a, profileId), toInboxSortable(b, profileId));
}

function sortPinned(
  rows: LoadedDMConversation[],
  profileId?: string,
): LoadedDMConversation[] {
  return sortInboxConversations(
    rows.filter((c) => isPinnedForViewer(c, profileId)),
    profileId,
  );
}

/** Filter + sort one continuous list — always chronological within the filtered set. */
export function filterConversationsForTab(
  rows: LoadedDMConversation[],
  tab: DmInboxTabId,
  profileIdOrOptions?: string | DmInboxTabFilterOptions,
  requestConversationIds?: Set<string>,
  callConversationIds?: Set<string>,
): LoadedDMConversation[] {
  const options: DmInboxTabFilterOptions =
    typeof profileIdOrOptions === 'object' && profileIdOrOptions !== null
      ? profileIdOrOptions
      : {
          profileId: typeof profileIdOrOptions === 'string' ? profileIdOrOptions : undefined,
          requestConversationIds,
          callConversationIds,
        };
  const {
    profileId,
    requestConversationIds: requestIdsRaw,
    callConversationIds: callIdsRaw,
    closeFriendIds: closeFriendIdsRaw,
    rankedBestFriendIds: rankedBestFriendIdsRaw,
    nearbyProfileIds: nearbyProfileIdsRaw,
    resolveOtherProfileId,
    presenceOnlineIds: presenceOnlineIdsRaw,
  } = options;
  const requestIds = ensureStringSet(requestIdsRaw);
  const callIds = ensureStringSet(callIdsRaw);
  const closeFriendIds = ensureStringSet(closeFriendIdsRaw);
  const rankedBestFriendIds = ensureStringSet(rankedBestFriendIdsRaw);
  const nearbyProfileIds = ensureStringSet(nearbyProfileIdsRaw);
  const presenceOnlineIds = ensureStringSet(presenceOnlineIdsRaw);
  const safe = ensureArray(rows);

  const chrono = (list: LoadedDMConversation[]) =>
    sortInboxConversations(list, profileId);

  switch (tab) {
    case 'all':
      return chrono(safe);
    case 'unread': {
      const unread = safe.filter(
        (c) => (c.unread_count || 0) > 0 || c._hasUnread || safeSetHas(callIds, c.id),
      );
      return chrono(unread.length ? unread : safe);
    }
    case 'needs_reply':
      return chrono(
        safe.filter(
          (c) =>
            conversationNeedsReply(c, profileId) &&
            !isMutedForViewer(c, profileId) &&
            !isNoiseLatest(c),
        ),
      );
    case 'groups':
      return chrono(safe.filter((c) => c.is_group));
    case 'pinned':
      return sortPinned(safe, profileId);
    case 'active':
      return chrono(
        safe.filter((c) => {
          if (c.is_group) return false;
          const otherId = resolveOtherProfileId?.(c);
          return Boolean(otherId && safeSetHas(presenceOnlineIds, otherId));
        }),
      );
    case 'friends':
      return chrono(
        safe.filter((c) => !c.is_group && !(requestIds.size && requestIds.has(c.id))),
      );
    case 'best_friends': {
      if (rankedBestFriendIds.size) {
        return chrono(
          safe.filter((c) => {
            if (c.is_group) return false;
            const otherId = resolveOtherProfileId?.(c);
            return Boolean(otherId && rankedBestFriendIds.has(otherId));
          }),
        );
      }
      if (!closeFriendIds.size) return [];
      return chrono(
        safe.filter((c) => {
          if (c.is_group) return false;
          const otherId = resolveOtherProfileId?.(c);
          return Boolean(otherId && closeFriendIds.has(otherId));
        }),
      );
    }
    case 'nearby':
      if (!nearbyProfileIds.size) return [];
      return chrono(
        safe.filter((c) => {
          if (c.is_group) return false;
          const otherId = resolveOtherProfileId?.(c);
          return Boolean(otherId && nearbyProfileIds.has(otherId));
        }),
      );
    case 'requests':
      if (!requestIds.size) return [];
      return chrono(safe.filter((c) => requestIds.has(c.id)));
    default:
      return chrono(safe);
  }
}

/** Preview-based filter — same Snapchat chrono rules within each filter. */
export function filterPreviewsForFilter(
  rows: DMConversationPreview[],
  filter: DmInboxFilterId,
): DMConversationPreview[] {
  const safe = ensureArray(rows);
  const chrono = sortInboxPreviews;

  switch (filter) {
    case 'all':
      return chrono(safe);
    case 'unread': {
      const unread = safe.filter((r) => r.isUnread || r.unreadCount > 0);
      return chrono(unread.length ? unread : safe);
    }
    case 'needs_reply':
      return chrono(safe.filter((r) => r.needsReply && !r.isMuted && !r.isGroup));
    case 'groups':
      return chrono(safe.filter((r) => r.isGroup));
    case 'pinned':
      return chrono(safe.filter((r) => r.isPinned));
    case 'active':
      return chrono(safe.filter((r) => !r.isGroup && r.isOnline));
    default:
      return chrono(safe);
  }
}

/**
 * Flat list without section headers (Messages redesign).
 * Legacy header rows are no longer emitted.
 */
export function buildFlatInboxRows(
  conversations: LoadedDMConversation[],
  _profileId?: string,
): Array<{ type: 'conversation'; conversation: LoadedDMConversation }> {
  return ensureArray(conversations).map((conversation) => ({
    type: 'conversation' as const,
    conversation,
  }));
}

/** @deprecated Prefer buildFlatInboxRows — sections removed. */
export function organizeInboxSections(
  conversations: LoadedDMConversation[],
  profileId?: string,
): DmInboxSection[] {
  return [
    {
      id: 'all',
      label: 'All',
      conversations: sortInboxConversations(ensureArray(conversations), profileId),
    },
  ];
}

/** @deprecated Alias — sectioned inbox removed in redesign. */
export function organizeDmInbox(
  conversations: LoadedDMConversation[],
  profileId?: string,
): DmInboxSection[] {
  const needs = ensureArray(conversations).filter((c) => conversationNeedsReply(c, profileId));
  if (needs.length) {
    return [{ id: 'needs_reply', label: 'Needs reply', conversations: needs }];
  }
  return organizeInboxSections(conversations, profileId);
}
