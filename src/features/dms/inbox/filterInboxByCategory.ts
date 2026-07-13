import type { InboxCategory } from '@/features/dms/dm.types';
import {
  compareInboxSortables,
  toInboxSortable,
} from '@/lib/sortInboxConversations';
import type { InboxConversationIndexEntry } from './buildInboxConversationIndex';

export interface FilteredInboxEntry extends InboxConversationIndexEntry {
  categoryMatch: boolean;
  categoryRank: number;
}

function compareChronoEntry(
  a: InboxConversationIndexEntry,
  b: InboxConversationIndexEntry,
  profileId?: string,
): number {
  return compareInboxSortables(
    toInboxSortable(a.conversation, profileId),
    toInboxSortable(b.conversation, profileId),
  );
}

function matchesCategory(
  entry: InboxConversationIndexEntry,
  category: InboxCategory,
): boolean {
  switch (category) {
    case 'all':
      return true;
    case 'unread':
      return entry.isUnread || entry.hasRecentCall;
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
    case 'active':
      return entry.isPeerOnline;
    case 'new':
      return false;
    default:
      return true;
  }
}

/**
 * Hard filter + Snapchat chrono sort.
 * Visible rows never reorder from presence/typing/unread/rank — only message activity / pin.
 */
export function filterInboxByCategory(
  index: InboxConversationIndexEntry[],
  category: InboxCategory | null,
  profileId?: string,
): FilteredInboxEntry[] {
  const effective: InboxCategory = category ?? 'all';

  if (effective === 'new') {
    return [];
  }

  const matches =
    effective === 'all'
      ? [...index]
      : index.filter((entry) => matchesCategory(entry, effective));

  const sorted = matches.sort((a, b) => compareChronoEntry(a, b, profileId));

  return sorted.map((entry) => ({
    ...entry,
    categoryMatch: true,
    categoryRank: entry.activityMs,
  }));
}

export function countCategoryMatches(
  index: InboxConversationIndexEntry[],
  category: InboxCategory,
): number {
  if (category === 'new') return 0;
  return index.filter((entry) => matchesCategory(entry, category)).length;
}
