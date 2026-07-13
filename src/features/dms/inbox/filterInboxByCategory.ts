import type { InboxCategory } from '@/features/dms/dm.types';
import { compareInboxActivity } from '@/lib/dmInboxOrganize';
import type { InboxConversationIndexEntry } from './buildInboxConversationIndex';

export interface FilteredInboxEntry extends InboxConversationIndexEntry {
  categoryMatch: boolean;
  categoryRank: number;
}

function compareActivityEntry(
  a: InboxConversationIndexEntry,
  b: InboxConversationIndexEntry,
  profileId?: string,
): number {
  return compareInboxActivity(a.conversation, b.conversation, profileId);
}

function matchesCategory(
  entry: InboxConversationIndexEntry,
  category: InboxCategory,
): boolean {
  switch (category) {
    case 'all':
      return true;
    case 'unread':
      return entry.isUnread;
    case 'needs-reply':
      return entry.needsReply;
    case 'nearby':
      return entry.isNearby;
    case 'groups':
      return entry.isGroup;
    case 'stories':
      return entry.hasUnviewedStory || entry.hasViewedStory;
    case 'calls':
      return entry.hasRecentCall;
    case 'best-friends':
      return entry.isCloseFriend;
    case 'streaks':
      return entry.hasActiveStreak;
    case 'new':
      return false;
    default:
      return true;
  }
}

function rankWithinCategory(
  entry: InboxConversationIndexEntry,
  category: InboxCategory,
): number {
  switch (category) {
    case 'unread':
      return entry.activityMs;
    case 'needs-reply':
      return -entry.activityMs;
    case 'nearby':
      return -entry.nearbyRank * 1_000_000_000_000 + entry.activityMs;
    case 'groups':
      return entry.activityMs;
    case 'stories':
      return (entry.hasUnviewedStory ? 2 : entry.hasViewedStory ? 1 : 0) * 1_000_000_000_000 + entry.activityMs;
    case 'calls': {
      const at = entry.callSummary?.at ? Date.parse(entry.callSummary.at) : 0;
      return Number.isFinite(at) ? at : entry.activityMs;
    }
    case 'best-friends': {
      const rank = entry.bestFriendRank ?? 99;
      return -rank * 1_000_000_000_000 + entry.activityMs;
    }
    case 'streaks': {
      const urgencyScore =
        entry.streakUrgency === 'warning' ? 3 : entry.streakUrgency === 'active' ? 2 : 1;
      return urgencyScore * 1_000_000_000_000 + entry.streakCount * 1_000_000_000 + entry.activityMs;
    }
    default:
      return entry.activityMs;
  }
}

function sortMatches(
  entries: InboxConversationIndexEntry[],
  category: InboxCategory,
  profileId?: string,
): InboxConversationIndexEntry[] {
  if (category === 'all') {
    return [...entries].sort((a, b) => compareActivityEntry(a, b, profileId));
  }
  return [...entries].sort((a, b) => {
    const rankDiff = rankWithinCategory(b, category) - rankWithinCategory(a, category);
    if (rankDiff !== 0) return rankDiff;
    return compareActivityEntry(a, b, profileId);
  });
}

/**
 * Soft-dim filter: matching rows first (full opacity), non-matches after (dimmed).
 * `category` null or `all` = all rows match, sorted by recency.
 */
export function filterInboxByCategory(
  index: InboxConversationIndexEntry[],
  category: InboxCategory | null,
  profileId?: string,
): FilteredInboxEntry[] {
  const effective: InboxCategory = category ?? 'all';

  if (effective === 'new') {
    return index.map((entry) => ({
      ...entry,
      categoryMatch: false,
      categoryRank: entry.activityMs,
    }));
  }

  const matches: InboxConversationIndexEntry[] = [];
  const nonMatches: InboxConversationIndexEntry[] = [];

  for (const entry of index) {
    if (matchesCategory(entry, effective)) {
      matches.push(entry);
    } else if (effective !== 'all') {
      nonMatches.push(entry);
    }
  }

  const sortedMatches = sortMatches(matches, effective, profileId);
  const sortedNonMatches =
    effective === 'all'
      ? []
      : [...nonMatches].sort((a, b) => compareActivityEntry(a, b, profileId));

  const ordered = effective === 'all' ? sortedMatches : [...sortedMatches, ...sortedNonMatches];

  return ordered.map((entry, position) => ({
    ...entry,
    categoryMatch: matchesCategory(entry, effective),
    categoryRank: rankWithinCategory(entry, effective) - position,
  }));
}

export function countCategoryMatches(
  index: InboxConversationIndexEntry[],
  category: InboxCategory,
): number {
  if (category === 'new') return 0;
  return index.filter((entry) => matchesCategory(entry, category)).length;
}
