import { useMemo } from 'react';
import type { InboxCategory } from '@/features/dms/dm.types';
import {
  buildInboxConversationIndex,
  type BuildInboxIndexInput,
} from './buildInboxConversationIndex';
import { filterInboxByCategory, type FilteredInboxEntry } from './filterInboxByCategory';
import { buildInboxCategoryCounts } from './inboxCategoryCounts';
import type { DMInboxBadges } from '@/features/dms/dm.types';
import { ensureStringSet } from '@/lib/persistedCollections';

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
    presenceOnlineIds,
    resolveOtherProfileId,
  } = input;

  // Order-relevant fields only — unread/presence must not appear here as sort drivers.
  const conversationOrderKey = useMemo(
    () =>
      conversations
        .map((c) => {
          const membership = c.members?.find((m) => m.user_id === profileId) as
            | { is_pinned?: boolean; pin_order?: number }
            | undefined;
          return `${c.id}:${c.last_message?.created_at ?? c._sortTime ?? ''}:${membership?.is_pinned ? 1 : 0}:${membership?.pin_order ?? ''}`;
        })
        .join('\0'),
    [conversations, profileId],
  );

  const presenceKey = useMemo(
    () => [...ensureStringSet(presenceOnlineIds)].sort().join('\0'),
    [presenceOnlineIds],
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
      presenceOnlineIds,
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
    conversationOrderKey,
    presenceKey,
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
    presenceOnlineIds,
    resolveOtherProfileId,
  ]);
}
