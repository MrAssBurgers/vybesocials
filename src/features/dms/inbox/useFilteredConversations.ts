import { useMemo } from 'react';
import type { InboxCategory } from '@/features/dms/dm.types';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
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

  const conversationRevisionKey = useMemo(
    () =>
      conversations
        .map(
          (c) =>
            `${c.id}:${c.last_message?.created_at ?? ''}:${c.unread_count ?? 0}:${c._hasUnread ? 1 : 0}`,
        )
        .join('\0'),
    [conversations],
  );

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
    conversationRevisionKey,
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
