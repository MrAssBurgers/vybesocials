import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import type { DMConversationPreview, DmInboxFilterId } from '@/features/dms/dm.types';
import { conversationNeedsReply } from '@/lib/dmNeedsReply';
import { safeDmMembers, ensureArray } from '@/lib/persistedCollections';

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

function activityMs(conv: LoadedDMConversation): number {
  const raw = conv._sortTime || conv.last_message?.created_at || conv.updated_at || '';
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

function isPinnedForViewer(conv: LoadedDMConversation, profileId?: string): boolean {
  if (!profileId) return false;
  return Boolean(
    safeDmMembers(conv.members).find((m) => m.user_id === profileId)?.is_pinned,
  );
}

function isMutedForViewer(conv: LoadedDMConversation, profileId?: string): boolean {
  if (!profileId) return false;
  return Boolean(
    safeDmMembers(conv.members).find((m) => m.user_id === profileId)?.is_muted,
  );
}

function isNoiseLatest(conv: LoadedDMConversation): boolean {
  const type = String(
    conv.last_message?.message_type || conv.last_message?.media_type || 'text',
  ).toLowerCase();
  if (['system', 'reaction', 'call', 'missed_call'].includes(type)) return true;
  if (conv.last_message?.is_deleted) return true;
  return false;
}

/**
 * All: latest activity primary. Pinned / unread are tiny tie-breakers only
 * (±1ms-scale) so old pinned threads never jump above fresher chats.
 */
export function compareInboxActivity(
  a: LoadedDMConversation,
  b: LoadedDMConversation,
  profileId?: string,
): number {
  const byTime = activityMs(b) - activityMs(a);
  if (byTime !== 0) return byTime;
  const aPinned = isPinnedForViewer(a, profileId) ? 1 : 0;
  const bPinned = isPinnedForViewer(b, profileId) ? 1 : 0;
  if (aPinned !== bPinned) return bPinned - aPinned;
  const aUnread = a._hasUnread || (a.unread_count || 0) > 0 ? 1 : 0;
  const bUnread = b._hasUnread || (b.unread_count || 0) > 0 ? 1 : 0;
  return bUnread - aUnread;
}

function sortPinned(
  rows: LoadedDMConversation[],
  profileId?: string,
): LoadedDMConversation[] {
  return [...rows].sort((a, b) => {
    const aOrder = Number(
      (safeDmMembers(a.members).find((m) => m.user_id === profileId) as { pin_order?: number } | undefined)
        ?.pin_order ?? 0,
    );
    const bOrder = Number(
      (safeDmMembers(b.members).find((m) => m.user_id === profileId) as { pin_order?: number } | undefined)
        ?.pin_order ?? 0,
    );
    if (aOrder !== bOrder) return Number(aOrder) - Number(bOrder);
    return compareInboxActivity(a, b, profileId);
  });
}

function sortActive(
  rows: LoadedDMConversation[],
  options: DmInboxTabFilterOptions,
): LoadedDMConversation[] {
  const { presenceOnlineIds, recentlyActiveIds, profileId } = options;
  return [...rows].sort((a, b) => {
    const aOther = options.resolveOtherProfileId?.(a);
    const bOther = options.resolveOtherProfileId?.(b);
    const aOnline = aOther && presenceOnlineIds?.has(aOther) ? 2 : 0;
    const bOnline = bOther && presenceOnlineIds?.has(bOther) ? 2 : 0;
    const aRecent = aOther && recentlyActiveIds?.has(aOther) ? 1 : 0;
    const bRecent = bOther && recentlyActiveIds?.has(bOther) ? 1 : 0;
    const aScore = aOnline + aRecent;
    const bScore = bOnline + bRecent;
    if (aScore !== bScore) return bScore - aScore;
    return compareInboxActivity(a, b, profileId);
  });
}

/** Filter + sort one continuous list for smart inbox filters. */
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
    requestConversationIds: requestIds,
    callConversationIds: callIds,
    closeFriendIds,
    rankedBestFriendIds,
    nearbyProfileIds,
    resolveOtherProfileId,
  } = options;
  const safe = ensureArray(rows);

  switch (tab) {
    case 'all': {
      return [...safe].sort((a, b) => compareInboxActivity(a, b, profileId));
    }
    case 'unread': {
      const unread = safe.filter(
        (c) => (c.unread_count || 0) > 0 || c._hasUnread || Boolean(callIds?.has(c.id)),
      );
      if (unread.length) {
        return unread.sort((a, b) => compareInboxActivity(a, b, profileId));
      }
      // When nothing is unread, show the full activity-sorted list.
      return [...safe].sort((a, b) => compareInboxActivity(a, b, profileId));
    }
    case 'needs_reply': {
      return safe
        .filter(
          (c) =>
            conversationNeedsReply(c, profileId) &&
            !isMutedForViewer(c, profileId) &&
            !isNoiseLatest(c),
        )
        .sort((a, b) => compareInboxActivity(a, b, profileId));
    }
    case 'groups': {
      return safe
        .filter((c) => c.is_group)
        .sort((a, b) => {
          const aMention = (a as { mention_count?: number }).mention_count || 0;
          const bMention = (b as { mention_count?: number }).mention_count || 0;
          if (aMention !== bMention) return bMention - aMention;
          const aUnread = a._hasUnread || (a.unread_count || 0) > 0 ? 1 : 0;
          const bUnread = b._hasUnread || (b.unread_count || 0) > 0 ? 1 : 0;
          if (aUnread !== bUnread) return bUnread - aUnread;
          return compareInboxActivity(a, b, profileId);
        });
    }
    case 'pinned': {
      return sortPinned(
        safe.filter((c) => isPinnedForViewer(c, profileId)),
        profileId,
      );
    }
    case 'active': {
      // Direct chats only — online → recently active → offline.
      return sortActive(
        safe.filter((c) => !c.is_group),
        options,
      );
    }
    // Legacy tabs (rollback / pre-redesign)
    case 'friends':
      return safe.filter(
        (c) => !c.is_group && !(requestIds?.size && requestIds.has(c.id)),
      );
    case 'best_friends': {
      const ranked = rankedBestFriendIds;
      if (ranked?.size) {
        return safe
          .filter((c) => {
            if (c.is_group) return false;
            const otherId = resolveOtherProfileId?.(c);
            return Boolean(otherId && ranked.has(otherId));
          })
          .sort((a, b) => {
            const aId = resolveOtherProfileId?.(a);
            const bId = resolveOtherProfileId?.(b);
            const aRank = aId && ranked.has(aId) ? 1 : 0;
            const bRank = bId && ranked.has(bId) ? 1 : 0;
            if (aRank !== bRank) return bRank - aRank;
            return compareInboxActivity(a, b, profileId);
          });
      }
      if (!closeFriendIds?.size) return [];
      return safe.filter((c) => {
        if (c.is_group) return false;
        const otherId = resolveOtherProfileId?.(c);
        return Boolean(otherId && closeFriendIds.has(otherId));
      });
    }
    case 'nearby':
      if (!nearbyProfileIds?.size) return [];
      return safe.filter((c) => {
        if (c.is_group) return false;
        const otherId = resolveOtherProfileId?.(c);
        return Boolean(otherId && nearbyProfileIds.has(otherId));
      });
    case 'requests':
      if (!requestIds?.size) return [];
      return safe.filter((c) => requestIds.has(c.id));
    default:
      return [...safe].sort((a, b) => compareInboxActivity(a, b, profileId));
  }
}

/** Preview-based filter for projection-backed rows (preferred UI path). */
export function filterPreviewsForFilter(
  rows: DMConversationPreview[],
  filter: DmInboxFilterId,
): DMConversationPreview[] {
  const safe = ensureArray(rows);
  const byActivity = (a: DMConversationPreview, b: DMConversationPreview) => {
    const aT = Date.parse(a.latestMessageAt || '') || 0;
    const bT = Date.parse(b.latestMessageAt || '') || 0;
    if (bT !== aT) return bT - aT;
    if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
    return Number(b.isUnread) - Number(a.isUnread);
  };

  switch (filter) {
    case 'all':
      return [...safe].sort(byActivity);
    case 'unread': {
      const unread = safe.filter((r) => r.isUnread || r.unreadCount > 0);
      return (unread.length ? unread : safe).sort(byActivity);
    }
    case 'needs_reply':
      return safe
        .filter((r) => r.needsReply && !r.isMuted && !r.isGroup)
        .sort(byActivity);
    case 'groups':
      return safe
        .filter((r) => r.isGroup)
        .sort((a, b) => {
          if (a.mentionCount !== b.mentionCount) return b.mentionCount - a.mentionCount;
          if (a.isUnread !== b.isUnread) return Number(b.isUnread) - Number(a.isUnread);
          return byActivity(a, b);
        });
    case 'pinned':
      return safe
        .filter((r) => r.isPinned)
        .sort((a, b) => {
          if (a.pinOrder !== b.pinOrder) return a.pinOrder - b.pinOrder;
          return byActivity(a, b);
        });
    case 'active':
      return safe
        .filter((r) => !r.isGroup)
        .sort((a, b) => {
          const score = (r: DMConversationPreview) =>
            (r.isOnline ? 2 : 0) + (r.isAway ? 1 : 0);
          const diff = score(b) - score(a);
          return diff !== 0 ? diff : byActivity(a, b);
        });
    default:
      return [...safe].sort(byActivity);
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
      conversations: [...ensureArray(conversations)].sort((a, b) =>
        compareInboxActivity(a, b, profileId),
      ),
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
