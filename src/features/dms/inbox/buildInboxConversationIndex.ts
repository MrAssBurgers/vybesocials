import type { Streak } from '@/hooks/useStreaks';
import type { DMStoryState, InboxCallSummary, InboxStreakUrgency } from '@/features/dms/dm.types';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { conversationNeedsReply } from '@/lib/dmNeedsReply';
import { isMutedForViewer, isNoiseLatest } from '@/lib/dmInboxOrganize';
import { isStreakExpiringSoon } from '@/hooks/useStreaks';
import { ensureStringSet, normalizePersistedMap, safeSetHas } from '@/lib/persistedCollections';
import type { InboxRelationshipProjection } from '@/lib/relationship/relationshipTypes';

export interface InboxConversationIndexEntry {
  conversation: LoadedDMConversation;
  conversationId: string;
  otherProfileId?: string;
  activityMs: number;
  storyState: DMStoryState;
  isUnread: boolean;
  needsReply: boolean;
  isMuted: boolean;
  isGroup: boolean;
  isNearby: boolean;
  nearbyRank: number;
  hasRecentCall: boolean;
  callSummary?: InboxCallSummary;
  streakCount: number;
  streakUrgency?: InboxStreakUrgency;
  streakExpiresAt?: string;
  bestFriendRank?: number;
  isCloseFriend: boolean;
  hasActiveStreak: boolean;
  hasUnviewedStory: boolean;
  hasViewedStory: boolean;
  /** Peer currently online — Active filter only; never used for default sort. */
  isPeerOnline: boolean;
}

export interface BuildInboxIndexInput {
  conversations: LoadedDMConversation[];
  profileId?: string;
  storyStateByProfileId: Map<string, DMStoryState>;
  streakMap: Map<string, Streak>;
  callSummaries: Map<string, InboxCallSummary>;
  nearbyProfileIds: Set<string>;
  nearbyRankByProfileId?: Map<string, number>;
  closeFriendIds: Set<string>;
  rankedBestFriendIds: Set<string>;
  bestFriendRankByProfileId?: Map<string, number>;
  projectionStreakStateByConversationId?: Map<string, InboxRelationshipProjection['streak_state']>;
  /** Online peer profile ids — Active filter membership only. */
  presenceOnlineIds?: Set<string>;
  resolveOtherProfileId: (conversation: LoadedDMConversation) => string | undefined;
}

function activityMs(conv: LoadedDMConversation): number {
  const raw = conv._sortTime || conv.last_message?.created_at || conv.updated_at || '';
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

function resolveStreakUrgency(
  streak: Streak | undefined,
  projectionState?: InboxRelationshipProjection['streak_state'],
): InboxStreakUrgency | undefined {
  if (projectionState === 'warning') return 'warning';
  if (projectionState === 'expired') return 'expired';
  if (!streak?.streak_count) return undefined;
  if (streak.expires_at && new Date(streak.expires_at).getTime() <= Date.now()) {
    return 'expired';
  }
  if (streak.expires_at && isStreakExpiringSoon(streak.expires_at)) {
    return 'warning';
  }
  return 'active';
}

export function buildInboxConversationIndex(input: BuildInboxIndexInput): InboxConversationIndexEntry[] {
  const {
    conversations,
    profileId,
    resolveOtherProfileId,
  } = input;

  // Persisted RQ cache can turn Set/Map into plain objects — never call .has/.get raw.
  const storyStateByProfileId = normalizePersistedMap<DMStoryState>(input.storyStateByProfileId);
  const streakMap = normalizePersistedMap<Streak>(input.streakMap);
  const callSummaries = normalizePersistedMap<InboxCallSummary>(input.callSummaries);
  const nearbyProfileIds = ensureStringSet(input.nearbyProfileIds);
  const nearbyRankByProfileId = normalizePersistedMap<number>(input.nearbyRankByProfileId);
  const closeFriendIds = ensureStringSet(input.closeFriendIds);
  const rankedBestFriendIds = ensureStringSet(input.rankedBestFriendIds);
  const presenceOnlineIds = ensureStringSet(input.presenceOnlineIds);
  const bestFriendRankByProfileId = normalizePersistedMap<number>(input.bestFriendRankByProfileId);
  const projectionStreakStateByConversationId = normalizePersistedMap<
    InboxRelationshipProjection['streak_state']
  >(input.projectionStreakStateByConversationId);

  return conversations.map((conversation) => {
    const conversationId = conversation.id;
    const otherProfileId = conversation.is_group
      ? undefined
      : resolveOtherProfileId(conversation);
    const storyState =
      (otherProfileId && storyStateByProfileId.get(otherProfileId)) || 'none';
    const streak = otherProfileId ? streakMap.get(otherProfileId) : undefined;
    const streakCount = streak?.streak_count ?? 0;
    const projectionStreak = projectionStreakStateByConversationId.get(conversationId);
    const streakUrgency = resolveStreakUrgency(streak, projectionStreak);
    const callSummary = callSummaries.get(conversationId);
    const unreadCount = conversation.unread_count || 0;
    const isUnread = unreadCount > 0 || Boolean(conversation._hasUnread);
    const needsReply =
      conversationNeedsReply(conversation, profileId) &&
      !isMutedForViewer(conversation, profileId) &&
      !isNoiseLatest(conversation);
    const bestFriendRank =
      otherProfileId && safeSetHas(rankedBestFriendIds, otherProfileId)
        ? bestFriendRankByProfileId.get(otherProfileId)
        : undefined;
    const isCloseFriend = Boolean(
      otherProfileId &&
        (safeSetHas(closeFriendIds, otherProfileId) ||
          safeSetHas(rankedBestFriendIds, otherProfileId)),
    );

    return {
      conversation,
      conversationId,
      otherProfileId,
      activityMs: activityMs(conversation),
      storyState,
      isUnread,
      needsReply,
      isMuted: isMutedForViewer(conversation, profileId),
      isGroup: Boolean(conversation.is_group),
      isNearby: Boolean(otherProfileId && safeSetHas(nearbyProfileIds, otherProfileId)),
      nearbyRank: otherProfileId
        ? nearbyRankByProfileId.get(otherProfileId) ?? 99
        : 99,
      hasRecentCall: Boolean(callSummary),
      callSummary,
      streakCount,
      streakUrgency,
      streakExpiresAt: streak?.expires_at,
      bestFriendRank: bestFriendRank ?? undefined,
      isCloseFriend,
      hasActiveStreak:
        streakCount > 0 && streakUrgency !== 'expired',
      hasUnviewedStory: storyState === 'unviewed',
      hasViewedStory: storyState === 'viewed',
      isPeerOnline: Boolean(
        otherProfileId && safeSetHas(presenceOnlineIds, otherProfileId),
      ),
    };
  });
}
