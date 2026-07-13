import { useMemo } from 'react';
import type { InboxCategory } from '@/features/dms/dm.types';
import {
  buildInboxConversationIndex,
  type BuildInboxIndexInput,
} from './buildInboxConversationIndex';
import { filterInboxByCategory, type FilteredInboxEntry } from './filterInboxByCategory';
import { buildInboxCategoryCounts } from './inboxCategoryCounts';
import type { DMInboxBadges } from '@/features/dms/dm.types';

export interface UseFilteredConversationsInput extends BuildInboxIndexInput {
  category: InboxCategory | null;
  pendingRequestCount: number;
  suggestionCount?: number;
}

export interface FilteredInboxResult {
  index: ReturnType<typeof buildInboxConversationIndex>;
  filtered: FilteredInboxEntry[];
  counts: DMInboxBadges;
  matchCount: number;
}

export function useFilteredConversations(
  input: UseFilteredConversationsInput,
): FilteredInboxResult {
  const {
    category,
    pendingRequestCount,
    suggestionCount = 0,
    conversations,
    profileId,
    storyStateByProfileId,
    streakMap,
    callSummaries,
    nearbyProfileIds,
    nearbyRankByProfileId,
    closeFriendIds,
    rankedBestFriendIds,
    bestFriendRankByProfileId,
    projectionStreakStateByConversationId,
    resolveOtherProfileId,
  } = input;

  return useMemo(() => {
    const index = buildInboxConversationIndex({
      conversations,
      profileId,
      storyStateByProfileId,
      streakMap,
      callSummaries,
      nearbyProfileIds,
      nearbyRankByProfileId,
      closeFriendIds,
      rankedBestFriendIds,
      bestFriendRankByProfileId,
      projectionStreakStateByConversationId,
      resolveOtherProfileId,
    });
    const filtered = filterInboxByCategory(index, category, profileId);
    const counts = buildInboxCategoryCounts({
      index,
      pendingRequestCount,
      suggestionCount,
    });
    const effective = category ?? 'all';
    const matchCount =
      effective === 'all'
        ? filtered.length
        : effective === 'new'
          ? pendingRequestCount + suggestionCount
          : filtered.filter((entry) => entry.categoryMatch).length;

    return { index, filtered, counts, matchCount };
  }, [
    category,
    pendingRequestCount,
    suggestionCount,
    conversations,
    profileId,
    storyStateByProfileId,
    streakMap,
    callSummaries,
    nearbyProfileIds,
    nearbyRankByProfileId,
    closeFriendIds,
    rankedBestFriendIds,
    bestFriendRankByProfileId,
    projectionStreakStateByConversationId,
    resolveOtherProfileId,
  ]);
}
