import type { InboxCategory } from '@/features/dms/dm.types';
import type { DMInboxBadges } from '@/features/dms/dm.types';
import { INBOX_CATEGORIES } from './inboxCategoryModel';
import { countCategoryMatches, type FilteredInboxEntry } from './filterInboxByCategory';
import type { InboxConversationIndexEntry } from './buildInboxConversationIndex';

export interface InboxCategoryCountsInput {
  index: InboxConversationIndexEntry[];
  pendingRequestCount: number;
  suggestionCount?: number;
}

export function buildInboxCategoryCounts(input: InboxCategoryCountsInput): DMInboxBadges {
  const { index, pendingRequestCount, suggestionCount = 0 } = input;
  const counts: DMInboxBadges = {
    unread: countCategoryMatches(index, 'unread'),
    requests: pendingRequestCount,
    needsReply: countCategoryMatches(index, 'needs-reply'),
    bestFriends: countCategoryMatches(index, 'best-friends'),
    nearby: countCategoryMatches(index, 'nearby'),
    groups: countCategoryMatches(index, 'groups'),
    stories: countCategoryMatches(index, 'stories'),
    calls: countCategoryMatches(index, 'calls'),
    streaks: countCategoryMatches(index, 'streaks'),
    active: countCategoryMatches(index, 'active'),
    new: pendingRequestCount + suggestionCount,
  };
  return counts;
}

export function countMatchesInFiltered(
  filtered: FilteredInboxEntry[],
  category: InboxCategory | null,
): number {
  if (!category || category === 'all') return filtered.length;
  if (category === 'new') return 0;
  return filtered.filter((entry) => entry.categoryMatch).length;
}

export function categoriesWithCounts(
  counts: DMInboxBadges,
): Array<{ id: InboxCategory; count: number }> {
  return INBOX_CATEGORIES.map((id) => {
    switch (id) {
      case 'unread':
        return { id, count: counts.unread };
      case 'needs-reply':
        return { id, count: counts.needsReply ?? 0 };
      case 'nearby':
        return { id, count: counts.nearby ?? 0 };
      case 'groups':
        return { id, count: counts.groups ?? 0 };
      case 'stories':
        return { id, count: counts.stories ?? 0 };
      case 'calls':
        return { id, count: counts.calls ?? 0 };
      case 'best-friends':
        return { id, count: counts.bestFriends ?? 0 };
      case 'streaks':
        return { id, count: counts.streaks ?? 0 };
      case 'active':
        return { id, count: counts.active ?? 0 };
      case 'new':
        return { id, count: counts.new ?? 0 };
      default:
        return { id, count: 0 };
    }
  });
}
