import { useEffect, useMemo, useState, useCallback, useRef, useDeferredValue } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useDMConversations } from '@/hooks/useDMConversations';
import { useConversationTyping } from '@/hooks/useConversationTyping';
import { useConversationListPresence } from '@/hooks/useConversationListPresence';
import { useInboxCallSummaries } from '@/hooks/useInboxCallSummaries';
import { useQuickAddSuggestions } from '@/hooks/useQuickAddSuggestions';
import { useLockedChatIds } from '@/hooks/useLockedChats';
import { useMessageRequests, usePendingRequestCount } from '@/hooks/useMessageRequests';
import { useRecentNewFriendProfileIds } from '@/hooks/useRecentNewFriendProfileIds';
import { useStreakMap, type Streak } from '@/hooks/useStreaks';
import { useStories } from '@/hooks/useStories';
import { useCloseFriendIds } from '@/hooks/useCloseFriendIds';
import { useNearbyFriendLink } from '@/hooks/useNearbyFriendLink';
import {
  filterConversationsForTab,
} from '@/lib/dmInboxOrganize';
import {
  displayNameForConversation,
  resolveOtherMemberFromConversation,
} from '@/lib/dmMemberResolve';
import { dmConversationPreviewText } from '@/lib/dmPreviewText';
import { resolveDmInboxStatus } from '@/lib/dmInboxStatus';
import { ensureArray, ensureStringSet, normalizePersistedMap, safeDmMembers } from '@/lib/persistedCollections';
import { getInboxPinState } from '@/lib/sortInboxConversations';
import { resolveSessionProfileId } from '@/lib/resolveSessionProfileId';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { batchSignUrls } from '@/lib/signedUrlCache';
import { normalizeStoryGroups } from '@/lib/storiesCacheSanitize';
import { useDmInboxProjection } from './useDmInboxProjection';
import {
  compareDmInboxShadow,
  summarizeDmInboxShadow,
} from '@/lib/dmInboxShadowCompare';
import { conversationNeedsReply } from '@/lib/dmNeedsReply';
import { mergeLegacyAndProjection } from '@/lib/dmInboxProjectionMerge';
import { resolveInboxDisplayRows } from './inbox/dmInboxDisplayRows';
import { logDmInboxDebug, logDmInboxGeometryReset } from './inbox/dmInboxDebug';
import { isDmInboxCategoryBarEnabled, isDmInboxProjectionReadEnabled, isRelationshipEmojiUiEnabled, isRelationshipProjectionReadEnabled } from '@/lib/dmInboxFeatureFlags';
import { useInboxCategories } from './inbox/useInboxCategories';
import { useFilteredConversations } from './inbox/useFilteredConversations';
import { pickPrimaryInboxEmoji, resolveStreakDisplay } from '@/lib/relationship/relationshipEmojiMap';
import { useRelationshipEmojiPreferences } from '@/hooks/useRelationshipEmojiPreferences';
import { writeStoredInboxFilter } from '@/lib/dmInboxFilterPersistence';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import type { DMConversationPreview, DMInboxRow, DMStoryState, DmInboxFilterId, DmInboxTabId, InboxCallSummary } from './dm.types';

const TAB_STORAGE_KEY = 'vybe-dm-inbox-tab';
const EMPTY_CONVERSATIONS: LoadedDMConversation[] = [];

function conversationContentRevision(conversation: LoadedDMConversation): string {
  const lastMessage = conversation.last_message;
  return [
    conversation.id,
    conversation.unread_count ?? 0,
    conversation._hasUnread ? '1' : '0',
    lastMessage?.id ?? '',
    lastMessage?.created_at ?? '',
    lastMessage?.message_type ?? '',
    conversation.updated_at ?? '',
  ].join('|');
}
const REDESIGN_TABS: DmInboxTabId[] = [
  'all',
  'unread',
  'needs_reply',
  'groups',
  'pinned',
  'active',
];
const LEGACY_TABS: DmInboxTabId[] = [
  'friends',
  'best_friends',
  'nearby',
  'groups',
  'requests',
  'unread',
];

function initialTab(redesignEnabled: boolean): DmInboxTabId {
  const fallback: DmInboxTabId = redesignEnabled ? 'all' : 'friends';
  if (typeof sessionStorage === 'undefined') return fallback;
  try {
    const filter = sessionStorage.getItem('vybe-dm-inbox-filter');
    const stored = filter || sessionStorage.getItem(TAB_STORAGE_KEY);
    if (stored === 'calls') return 'unread';
    if (redesignEnabled) {
      if (stored && REDESIGN_TABS.includes(stored as DmInboxTabId)) {
        return stored as DmInboxTabId;
      }
      return 'all';
    }
    if (stored && LEGACY_TABS.includes(stored as DmInboxTabId)) {
      return stored as DmInboxTabId;
    }
    return 'friends';
  } catch {
    return fallback;
  }
}

function secondaryGroupAvatar(
  conversation: {
    is_group?: boolean;
    members?: Array<{ user_id: string; profile?: Record<string, unknown> | null }>;
  },
  profileId?: string,
  primaryProfileId?: string,
): string | undefined {
  if (!conversation.is_group) return undefined;
  const others = safeDmMembers(conversation.members).filter((member) => {
    if (member.user_id === profileId) return false;
    const memberProfileId = member.profile?.id ? String(member.profile.id) : undefined;
    return memberProfileId !== primaryProfileId;
  });
  const secondary = others[1] || others[0];
  if (!secondary) return undefined;
  const profile = secondary.profile as { id?: string; avatar_url?: string | null } | null | undefined;
  return (
    resolveProfileAvatarUrl(
      profile?.id ? String(profile.id) : secondary.user_id,
      profile?.avatar_url,
    ) || undefined
  );
}

function memberMatchesSender(
  conversation: {
    is_group?: boolean;
    members?: Array<{ user_id: string; profile?: { id?: string } | null }>;
  },
  senderId: string,
  resolveOtherProfileId?: (c: typeof conversation) => string | undefined,
): boolean {
  if (conversation.is_group) return false;
  if (resolveOtherProfileId?.(conversation) === senderId) return true;
  return safeDmMembers(conversation.members).some((member) => {
    if (member.user_id === senderId) return true;
    const profileId = member.profile?.id ? String(member.profile.id) : undefined;
    return profileId === senderId;
  });
}

export function useDMInbox() {
  const { conversationId: activeConversationId } = useParams<{ conversationId?: string }>();
  const { profile, user, authReady } = useAuth();
  const profileId = useAuthProfileId();
  const [profileResolveTimedOut, setProfileResolveTimedOut] = useState(false);
  const redesignEnabled = false;
  const categoryBarEnabled = isDmInboxCategoryBarEnabled(profileId, user?.id);
  const inboxCategories = useInboxCategories();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTabState] = useState<DmInboxTabId>(() => initialTab(false));
  const { data: lockedIdsRaw } = useLockedChatIds();
  const { data: callSummariesRaw } = useInboxCallSummaries();
  const callSummaries = useMemo(
    () => normalizePersistedMap<InboxCallSummary>(callSummariesRaw),
    [callSummariesRaw],
  );
  const callConversationIds = useMemo(
    () => new Set(callSummaries.keys()),
    [callSummaries],
  );
  const { data: pendingRequestsRaw, isLoading: requestsLoading } = useMessageRequests();
  const { data: pendingRequestCount = 0 } = usePendingRequestCount();
  const { data: recentNewFriendIdsRaw } = useRecentNewFriendProfileIds();
  const {
    ids: closeFriendIdsRaw,
    isLoading: closeFriendsLoading,
    isFetched: closeFriendsFetched,
  } = useCloseFriendIds();
  const streakMapRaw = useStreakMap();
  const streakMap = useMemo(
    () => normalizePersistedMap<Streak>(streakMapRaw),
    [streakMapRaw],
  );
  const { data: storyGroupsRaw } = useStories();
  const query = useDMConversations(searchQuery);
  const nearbyEnabled =
    Boolean(profileId) &&
    (categoryBarEnabled
      ? inboxCategories.activeCategory === 'nearby'
      : activeTab === 'nearby');
  const nearby = useNearbyFriendLink({
    enabled: nearbyEnabled,
    profileId,
    username: profile?.username,
    displayName: profile?.display_name,
    avatarUrl: profile?.avatar_url,
  });
  const projection = useDmInboxProjection(profileId);

  const { suggestions: quickAddSuggestions } = useQuickAddSuggestions(
    categoryBarEnabled ? 8 : 0,
  );
  const suggestionCount = categoryBarEnabled ? (quickAddSuggestions?.length ?? 0) : 0;
  const lockedIds = useMemo(() => ensureStringSet(lockedIdsRaw), [lockedIdsRaw]);
  const pendingRequests = useMemo(
    () => ensureArray<import('@/hooks/useMessageRequests').MessageRequest>(pendingRequestsRaw),
    [pendingRequestsRaw],
  );
  const recentNewFriendIds = useMemo(
    () => ensureStringSet(recentNewFriendIdsRaw),
    [recentNewFriendIdsRaw],
  );
  const closeFriendIds = useMemo(
    () => ensureStringSet(closeFriendIdsRaw),
    [closeFriendIdsRaw],
  );

  const relationshipProjectionRead = isRelationshipProjectionReadEnabled(profileId, user?.id);
  const relationshipEmojiUi = isRelationshipEmojiUiEnabled(profileId, user?.id);
  const { data: emojiPrefs } = useRelationshipEmojiPreferences(
    relationshipEmojiUi ? profileId : null,
  );

  const projectionByConversationId = useMemo(() => {
    const map = new Map<string, (typeof projection.entries)[number]>();
    for (const entry of projection.entries) {
      map.set(entry.conversation_id, entry);
    }
    return map;
  }, [projection.entries]);

  const rankedBestFriendIds = useMemo(() => {
    if (!relationshipProjectionRead) return new Set<string>();
    const ids = new Set<string>();
    for (const entry of projection.entries) {
      const rank = entry.best_friend_rank;
      if (
        rank != null &&
        rank >= 1 &&
        rank <= 8 &&
        entry.other_profile_id
      ) {
        ids.add(entry.other_profile_id);
      }
    }
    return ids;
  }, [projection.entries, relationshipProjectionRead]);

  const bestFriendRankByProfileId = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of projection.entries) {
      if (
        entry.other_profile_id &&
        entry.best_friend_rank != null &&
        entry.best_friend_rank >= 1
      ) {
        map.set(entry.other_profile_id, entry.best_friend_rank);
      }
    }
    return map;
  }, [projection.entries]);

  const projectionStreakStateByConversationId = useMemo(() => {
    const map = new Map<string, (typeof projection.entries)[number]['streak_state']>();
    for (const entry of projection.entries) {
      if (entry.streak_state) map.set(entry.conversation_id, entry.streak_state);
    }
    return map;
  }, [projection.entries]);

  const lastStableRowsRef = useRef<DMInboxRow[]>([]);
  const lastNonEmptyConversationsRef = useRef<LoadedDMConversation[]>([]);
  const corePreviewCacheRef = useRef(
    new Map<string, { revision: string; preview: DMConversationPreview }>(),
  );

  const allConversations = useMemo(() => {
    const legacy = [
      ...ensureArray(query.pinnedConversations),
      ...ensureArray(query.unpinnedConversations),
    ];

    const merged = mergeLegacyAndProjection({
      legacy,
      projectionEntries: projection.entries,
      lockedIds,
      projectionReadEnabled: isDmInboxProjectionReadEnabled(profileId, user?.id),
      projectionReady: projection.projectionReady,
      viewerId: profileId,
      viewerAuthUid: user?.id,
    });

    const prev = lastNonEmptyConversationsRef.current;
    // Never accept a shrink while the query is refetching or projection hydrates.
    if (
      prev.length > 0 &&
      merged.length > 0 &&
      merged.length < prev.length &&
      (query.isFetching || projection.isLoading)
    ) {
      return prev;
    }

    if (merged.length > 0) {
      lastNonEmptyConversationsRef.current = merged;
      return merged;
    }

    return prev;
  }, [
    query.pinnedConversations,
    query.unpinnedConversations,
    query.isFetching,
    lockedIds,
    projection.entries,
    projection.projectionReady,
    projection.isLoading,
    profileId,
    user?.id,
  ]);

  useEffect(() => {
    if (!projection.enabled || !projection.entries.length) return;
    const legacy = [
      ...ensureArray(query.pinnedConversations),
      ...ensureArray(query.unpinnedConversations),
    ];
    if (!legacy.length) return;
    const diff = compareDmInboxShadow(projection.entries, legacy, profileId);
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[dm-inbox-shadow]', summarizeDmInboxShadow(diff), diff);
    }
  }, [projection.enabled, projection.entries, query.pinnedConversations, query.unpinnedConversations, profileId]);

  const resolveOtherProfileId = useMemo(
    () => (conversation: (typeof allConversations)[number]) => {
      if (conversation.is_group) return undefined;
      const resolved = resolveOtherMemberFromConversation(conversation, profileId, user?.id);
      const other = resolved?.profile;
      return other?.id ? String(other.id) : resolved?.user_id;
    },
    [profileId, user?.id],
  );

  const requestConversationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const request of pendingRequests) {
      const match = allConversations.find((conversation) =>
        memberMatchesSender(conversation, request.sender_id, resolveOtherProfileId),
      );
      if (match) ids.add(match.id);
    }
    return ids;
  }, [pendingRequests, allConversations, resolveOtherProfileId]);

  const nearbyProfileIds = useMemo(
    () => new Set(nearby.peers.map((peer) => peer.userId)),
    [nearby.peers],
  );

  const storyStateByProfileId = useMemo(() => {
    const map = new Map<string, DMStoryState>();
    try {
      for (const group of normalizeStoryGroups(storyGroupsRaw)) {
        const id = group.user?.id ? String(group.user.id) : undefined;
        if (!id) continue;
        map.set(id, group.hasUnviewed ? 'unviewed' : 'viewed');
      }
    } catch {
      return map;
    }
    return map;
  }, [storyGroupsRaw]);

  const inboxListActive = !activeConversationId;

  const typingConversationIds = useMemo(
    () =>
      inboxListActive
        ? allConversations.slice(0, 12).map((conversation) => conversation.id)
        : [],
    [allConversations, inboxListActive],
  );
  const { isTyping } = useConversationTyping(typingConversationIds);

  // Defer presence subscribers until after first paint so the list isn't blocked.
  // Pause while a chat is open (shared Messages mount keeps inbox alive).
  const [presenceReady, setPresenceReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (!cancelled) setPresenceReady(true);
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, []);

  const presenceMapRaw = useConversationListPresence(
    presenceReady && inboxListActive ? allConversations : EMPTY_CONVERSATIONS,
    profileId,
    user?.id,
    activeConversationId,
  );
  const presenceMap = useMemo(
    () => normalizePersistedMap<ActivityType>(presenceMapRaw),
    [presenceMapRaw],
  );

  useEffect(() => {
    if (!user?.id || profileId) {
      setProfileResolveTimedOut(false);
      return;
    }
    if (!authReady) return;

    let cancelled = false;
    void resolveSessionProfileId(profile?.id);

    const timer = window.setTimeout(() => {
      if (!cancelled) setProfileResolveTimedOut(true);
    }, 8000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [user?.id, authReady, profileId, profile?.id]);

  const presenceOnlineIds = useMemo(() => {
    const ids = new Set<string>();
    for (const conversation of allConversations) {
      if (conversation.is_group) continue;
      const activity = presenceMap.get(conversation.id);
      if (!activity || activity === 'idle') continue;
      const otherId = resolveOtherProfileId(conversation);
      if (otherId) ids.add(otherId);
    }
    return ids;
  }, [allConversations, presenceMap, resolveOtherProfileId]);

  const deferredConversations = useDeferredValue(allConversations);

  const categoryFilter = useFilteredConversations({
    conversations: deferredConversations,
    profileId,
    storyStateByProfileId,
    streakMap,
    callSummaries,
    nearbyProfileIds,
    closeFriendIds,
    rankedBestFriendIds: relationshipProjectionRead ? rankedBestFriendIds : new Set<string>(),
    bestFriendRankByProfileId,
    projectionStreakStateByConversationId,
    presenceOnlineIds,
    resolveOtherProfileId,
    category: categoryBarEnabled ? inboxCategories.activeCategory : null,
    pendingRequestCount,
    suggestionCount,
  });

  const legacyFilteredConversations = useMemo(
    () =>
      filterConversationsForTab(deferredConversations, activeTab, {
        profileId,
        requestConversationIds,
        callConversationIds,
        closeFriendIds,
        rankedBestFriendIds: relationshipProjectionRead ? rankedBestFriendIds : undefined,
        nearbyProfileIds,
        resolveOtherProfileId,
        presenceOnlineIds,
      }),
    [
      deferredConversations,
      activeTab,
      profileId,
      requestConversationIds,
      callConversationIds,
      closeFriendIds,
      rankedBestFriendIds,
      relationshipProjectionRead,
      nearbyProfileIds,
      resolveOtherProfileId,
      presenceOnlineIds,
    ],
  );

  const filteredOrderKey = useMemo(
    () =>
      categoryBarEnabled
        ? categoryFilter.filtered.map((entry) => entry.conversationId).join('\0')
        : legacyFilteredConversations.map((c) => c.id).join('\0'),
    [categoryBarEnabled, categoryFilter.filtered, legacyFilteredConversations],
  );

  const filteredConversations = useMemo(() => {
    if (categoryBarEnabled) {
      return categoryFilter.filtered.map((entry) => entry.conversation);
    }
    return legacyFilteredConversations;
  }, [categoryBarEnabled, categoryFilter.filtered, legacyFilteredConversations, filteredOrderKey]);

  const toPreview = useMemo(() => {
    return (conversation: (typeof allConversations)[number]): DMConversationPreview => {
      try {
      const resolved = conversation.is_group
        ? null
        : resolveOtherMemberFromConversation(conversation, profileId, user?.id);
      const other = resolved?.profile as
        | {
            id?: string;
            username?: string;
            avatar_url?: string | null;
            is_verified?: boolean | null;
          }
        | null
        | undefined;
      const otherProfileId = other?.id ? String(other.id) : resolved?.user_id;
      const streakCount = otherProfileId
        ? streakMap.get(otherProfileId)?.streak_count
        : undefined;
      const membership = safeDmMembers(conversation.members).find(
        (member) => member.user_id === profileId,
      );
      const unreadCount = conversation.unread_count || 0;
      const status = resolveDmInboxStatus(
        conversation,
        profileId,
        user?.id,
        streakCount,
      );
      const lastMessage = conversation.last_message;
      const relationshipBadge =
        otherProfileId && closeFriendIds.has(otherProfileId)
          ? ('close_friend' as const)
          : otherProfileId && recentNewFriendIds.has(otherProfileId)
            ? ('new_friend' as const)
            : undefined;
      const storyState: DMStoryState =
        (otherProfileId && storyStateByProfileId.get(otherProfileId)) || 'none';
      const quickReaction =
        typeof (lastMessage as { reaction?: string } | null | undefined)?.reaction === 'string'
          ? (lastMessage as { reaction?: string }).reaction
          : undefined;

      const projEntry = projectionByConversationId.get(conversation.id);
      const relationship = projEntry
        ? {
            primary_relationship_state: projEntry.primary_relationship_state,
            best_friend_rank: projEntry.best_friend_rank,
            relationship_title: projEntry.relationship_title,
            streak_count: projEntry.streak_count,
            streak_state: projEntry.streak_state,
            birthday_state: projEntry.birthday_state,
            favorite_state: projEntry.favorite_state,
          }
        : undefined;

      const effectiveStreakCount =
        relationship?.streak_count ?? streakCount ?? 0;
      const relationshipEmoji =
        relationshipEmojiUi && relationship
          ? pickPrimaryInboxEmoji({
              primaryState: relationship.primary_relationship_state,
              birthdayState: relationship.birthday_state,
              streakState: relationship.streak_state,
              favoriteState: relationship.favorite_state,
              prefs: emojiPrefs,
            })
          : undefined;
      const streakDisplay =
        relationshipEmojiUi && relationship
          ? resolveStreakDisplay(
              effectiveStreakCount,
              relationship.streak_state ?? null,
              emojiPrefs,
            )
          : undefined;

      const statusLineWithStreak =
        streakDisplay && status.line
          ? `${status.line} · ${streakDisplay}`
          : streakDisplay && !status.line
            ? streakDisplay
            : status.line;

      return {
        conversation,
        id: conversation.id,
        conversationId: conversation.id,
        conversationType: conversation.is_group ? 'group' : 'direct',
        displayName: displayNameForConversation(
          conversation,
          profileId,
          user?.id,
          'Chat',
        ),
        username:
          typeof other?.username === 'string' ? other.username : undefined,
        avatarUrl: conversation.is_group
          ? conversation.avatar_url || undefined
          : resolveProfileAvatarUrl(
              otherProfileId,
              other?.avatar_url as string | null | undefined,
            ) || undefined,
        secondaryAvatarUrl: secondaryGroupAvatar(
          conversation,
          profileId,
          otherProfileId,
        ),
        otherProfileId,
        previewText: dmConversationPreviewText({
          lastMessage: conversation.last_message,
          isGroup: conversation.is_group,
          profileId,
          authUid: user?.id,
          otherProfileId,
          recentNewFriendIds,
          previewMaxLen: 48,
        }),
        statusLine: relationshipEmojiUi ? statusLineWithStreak : status.line,
        statusKind: status.kind,
        deliveryStatus: status.label,
        latestMessageType: String(
          lastMessage?.message_type || lastMessage?.media_type || 'text',
        ),
        latestSenderId: lastMessage?.sender_id,
        latestMessageAt: lastMessage?.created_at,
        unreadCount,
        mentionCount: 0,
        isUnread: unreadCount > 0 || conversation._hasUnread,
        isPinned: Boolean(membership?.is_pinned),
        pinOrder: getInboxPinState(conversation, profileId).pinOrder,
        isMuted: Boolean(membership?.is_muted),
        isArchived: false,
        needsReply: conversationNeedsReply(conversation, profileId),
        isGroup: conversation.is_group,
        isTyping: false,
        typingNames: [],
        isOnline: false,
        isAway: false,
        presenceState: 'offline',
        streakCount,
        storyState,
        isVerified: Boolean(other?.is_verified),
        relationshipBadge,
        relationship,
        relationshipEmoji,
        streakDisplay,
        quickReaction,
        fromProjection: Boolean(projEntry),
      };
      } catch (error) {
        console.warn('[useDMInbox] preview build failed', conversation.id, error);
        const unreadCount = conversation.unread_count || 0;
        return {
          conversation,
          id: conversation.id,
          conversationId: conversation.id,
          conversationType: conversation.is_group ? 'group' : 'direct',
          displayName: displayNameForConversation(
            conversation,
            profileId,
            user?.id,
            'Chat',
          ),
          previewText: 'Tap to chat',
          statusLine: 'Tap to chat',
          statusKind: 'start',
          deliveryStatus: 'Chat',
          latestMessageType: 'text',
          unreadCount,
          mentionCount: 0,
          isUnread: unreadCount > 0 || conversation._hasUnread,
          isPinned: false,
          pinOrder: 0,
          isMuted: false,
          isArchived: false,
          needsReply: false,
          isGroup: conversation.is_group,
          isTyping: false,
          typingNames: [],
          isOnline: false,
          isAway: false,
          presenceState: 'offline',
          storyState: 'none',
          isVerified: false,
          fromProjection: false,
        };
      }
    };
  }, [
    profileId,
    user?.id,
    recentNewFriendIds,
    closeFriendIds,
    streakMap,
    storyStateByProfileId,
    projectionByConversationId,
    relationshipEmojiUi,
    emojiPrefs,
  ]);

  const categoryEntryById = useMemo(() => {
    if (!categoryBarEnabled) return new Map();
    return new Map(categoryFilter.filtered.map((entry) => [entry.conversationId, entry]));
  }, [categoryBarEnabled, categoryFilter.filtered]);

  const enrichPreview = useCallback(
    (conversation: (typeof allConversations)[number], base: DMConversationPreview): DMConversationPreview => {
      const entry = categoryEntryById.get(conversation.id);
      if (!entry) return base;
      const active = inboxCategories.activeCategory;
      return {
        ...base,
        categoryMatch: entry.categoryMatch,
        categoryRank: entry.categoryRank,
        isCategoryDimmed: Boolean(active && active !== 'all' && !entry.categoryMatch),
        callSummary: entry.callSummary,
        streakUrgency: entry.streakUrgency,
        showQuickReply: active === 'needs-reply' && entry.needsReply,
        showCallback: active === 'calls' && entry.hasRecentCall,
      };
    },
    [categoryEntryById, inboxCategories.activeCategory],
  );

  const getCorePreview = useCallback(
    (conversation: LoadedDMConversation): DMConversationPreview => {
      const revision = conversationContentRevision(conversation);
      const cached = corePreviewCacheRef.current.get(conversation.id);
      if (cached && cached.revision === revision) {
        return cached.preview;
      }
      const preview = toPreview(conversation);
      corePreviewCacheRef.current.set(conversation.id, { revision, preview });
      return preview;
    },
    [toPreview],
  );

  const rows = useMemo<DMInboxRow[]>(() => {
    const previousById = new Map<string, DMInboxRow>();
    for (const row of lastStableRowsRef.current) {
      if (row.type === 'conversation') {
        previousById.set(row.preview.conversationId, row);
      }
    }

    const buildConversationRow = (
      conversation: LoadedDMConversation,
    ): DMInboxRow => {
      const preview = enrichPreview(conversation, getCorePreview(conversation));
      const prev = previousById.get(conversation.id);
      if (
        prev &&
        prev.type === 'conversation' &&
        prev.preview === preview
      ) {
        return prev;
      }
      if (
        prev &&
        prev.type === 'conversation' &&
        prev.preview.conversationId === preview.conversationId &&
        prev.preview.latestMessageAt === preview.latestMessageAt &&
        prev.preview.unreadCount === preview.unreadCount &&
        prev.preview.isUnread === preview.isUnread &&
        prev.preview.isPinned === preview.isPinned &&
        prev.preview.isMuted === preview.isMuted &&
        prev.preview.isCategoryDimmed === preview.isCategoryDimmed &&
        prev.preview.categoryMatch === preview.categoryMatch &&
        prev.preview.previewText === preview.previewText &&
        prev.preview.statusLine === preview.statusLine &&
        prev.preview.relationshipEmoji === preview.relationshipEmoji &&
        prev.preview.storyState === preview.storyState
      ) {
        // Reuse prior row object when visible fields are unchanged.
        return prev;
      }
      return { type: 'conversation' as const, preview };
    };

    if (categoryBarEnabled) {
      return filteredConversations.map(buildConversationRow);
    }

    if (activeTab === 'requests') {
      return pendingRequests.map((request) => ({
        type: 'request' as const,
        request,
      }));
    }

    if (activeTab === 'nearby') {
      const conversationRows: DMInboxRow[] = filteredConversations.map(buildConversationRow);
      const conversationPeerIds = new Set(
        filteredConversations
          .map((conversation) => resolveOtherProfileId(conversation))
          .filter((id): id is string => Boolean(id)),
      );
      const peerOnly: DMInboxRow[] = nearby.peers
        .filter((peer) => !conversationPeerIds.has(peer.userId))
        .map((peer) => ({ type: 'nearby_peer' as const, peer }));
      if (peerOnly.length) return [...conversationRows, ...peerOnly];
      return conversationRows;
    }

    return filteredConversations.map(buildConversationRow);
  }, [
    categoryBarEnabled,
    activeTab,
    pendingRequests,
    filteredConversations,
    filteredOrderKey,
    getCorePreview,
    enrichPreview,
    nearby.peers,
    resolveOtherProfileId,
  ]);

  useEffect(() => {
    const urls = rows.flatMap((row) => {
      if (row.type === 'conversation') {
        return [row.preview.avatarUrl, row.preview.secondaryAvatarUrl].filter(
          (value): value is string => Boolean(value),
        );
      }
      if (row.type === 'request') {
        return [
          resolveProfileAvatarUrl(
            row.request.sender?.id || row.request.sender_id,
            row.request.sender?.avatar_url,
          ),
        ].filter((value): value is string => Boolean(value));
      }
      if (row.type === 'nearby_peer') {
        return [
          resolveProfileAvatarUrl(row.peer.userId, row.peer.avatarUrl),
        ].filter((value): value is string => Boolean(value));
      }
      return [];
    });
    if (!urls.length) return;
    void batchSignUrls(urls.slice(0, 24));
    if (urls.length <= 24) return;
    const rest = urls.slice(24);
    const idle =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(() => {
            void batchSignUrls(rest);
          }, { timeout: 2500 })
        : window.setTimeout(() => {
            void batchSignUrls(rest);
          }, 800);
    return () => {
      if (typeof window.cancelIdleCallback === 'function' && typeof idle === 'number') {
        window.cancelIdleCallback(idle);
      } else {
        window.clearTimeout(idle as number);
      }
    };
  }, [rows]);

  const setActiveTab = (tab: DmInboxTabId) => {
    setActiveTabState(tab);
    try {
      sessionStorage.setItem(TAB_STORAGE_KEY, tab);
      if (REDESIGN_TABS.includes(tab)) {
        writeStoredInboxFilter(tab as DmInboxFilterId);
      }
    } catch {
      // Storage can be unavailable in Safari private mode.
    }
  };

  const legacyUnreadBadgeCount = useMemo(() => {
    let count = 0;
    for (const conversation of allConversations) {
      if ((conversation.unread_count || 0) > 0 || conversation._hasUnread) {
        count += 1;
      }
    }
    if (callConversationIds.size) {
      for (const id of callConversationIds) {
        const match = allConversations.find((conversation) => conversation.id === id);
        if (!match) continue;
        if ((match.unread_count || 0) > 0 || match._hasUnread) continue;
        count += 1;
      }
    }
    return count;
  }, [allConversations, callConversationIds]);

  const unreadBadgeCount = categoryBarEnabled
    ? categoryFilter.counts.unread
    : legacyUnreadBadgeCount;

  const legacyBestFriendCount = useMemo(() => {
    if (relationshipProjectionRead && rankedBestFriendIds.size) {
      return rankedBestFriendIds.size;
    }
    return allConversations.filter((conversation) => {
      if (conversation.is_group) return false;
      const otherId = resolveOtherProfileId(conversation);
      return Boolean(otherId && closeFriendIds.has(otherId));
    }).length;
  }, [
    allConversations,
    closeFriendIds,
    resolveOtherProfileId,
    relationshipProjectionRead,
    rankedBestFriendIds,
  ]);

  const bestFriendCount = categoryBarEnabled
    ? (categoryFilter.counts.bestFriends ?? 0)
    : legacyBestFriendCount;

  const totalUnreadCount = useMemo(() => {
    return allConversations.reduce((sum, conversation) => {
      if ((conversation.unread_count || 0) > 0) return sum + (conversation.unread_count || 0);
      if (conversation._hasUnread) return sum + 1;
      return sum;
    }, 0);
  }, [allConversations]);

  const legacyNeedsReplyCount = useMemo(
    () =>
      allConversations.filter((conversation) =>
        conversationNeedsReply(conversation, profileId),
      ).length,
    [allConversations, profileId],
  );

  const needsReplyCount = categoryBarEnabled
    ? (categoryFilter.counts.needsReply ?? 0)
    : legacyNeedsReplyCount;

  const showSkeleton =
    (query.isLoading && allConversations.length === 0) ||
    (!categoryBarEnabled &&
      ((activeTab === 'best_friends' && closeFriendsLoading && !closeFriendsFetched) ||
        (activeTab === 'requests' && requestsLoading && pendingRequests.length === 0)));

  const hasCachedRows =
    allConversations.length > 0 || lastNonEmptyConversationsRef.current.length > 0;

  const displayState = useMemo(
    () =>
      resolveInboxDisplayRows({
        rows,
        lastStableRows: lastStableRowsRef.current,
        hasCachedRows,
        isFetching: query.isFetching,
        isInitialLoad: query.isLoading && !query.isFetched,
        fetchSettled: query.isFetched,
        projectionHydrating: projection.isLoading && !projection.projectionReady,
        tabLoading: showSkeleton && rows.length === 0,
      }),
    [
      rows,
      hasCachedRows,
      query.isFetching,
      query.isLoading,
      query.isFetched,
      showSkeleton,
      projection.isLoading,
      projection.projectionReady,
    ],
  );

  lastStableRowsRef.current = displayState.lastStableRows;

  useEffect(() => {
    if (displayState.rejectedPartial) {
      logDmInboxGeometryReset('partial-rows-rejected', {
        rowCount: rows.length,
        previousRowCount: lastStableRowsRef.current.length,
        displayRowCount: displayState.displayRows.length,
        activeFilter: inboxCategories.activeCategory,
        querySource: projection.projectionReadEnabled ? 'projection+legacy' : 'legacy',
        isFetching: query.isFetching,
        projectionHydrating: projection.isLoading && !projection.projectionReady,
      });
    }
    logDmInboxDebug('inbox-state', {
      rowsIn: rows.length,
      displayRows: displayState.displayRows.length,
      activeCategory: inboxCategories.activeCategory,
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      isFetched: query.isFetched,
      projectionRead: projection.projectionReadEnabled,
      projectionEntries: projection.entries.length,
      projectionHydrating: projection.isLoading,
      listPhase: displayState.listPhase,
      rejectedPartial: displayState.rejectedPartial,
      rowKeys: displayState.displayRows
        .filter((r) => r.type === 'conversation')
        .map((r) => (r.type === 'conversation' ? r.preview.conversationId : '')),
    });
  }, [
    rows.length,
    displayState.displayRows.length,
    displayState.listPhase,
    displayState.rejectedPartial,
    inboxCategories.activeCategory,
    query.isLoading,
    query.isFetching,
    query.isFetched,
    projection.projectionReadEnabled,
    projection.entries.length,
    projection.isLoading,
    projection.projectionReady,
  ]);

  const awaitingProfileId = Boolean(user?.id && authReady && !profileId);

  const retryProfileResolve = () => {
    setProfileResolveTimedOut(false);
    void resolveSessionProfileId(profile?.id);
  };

  return {
    profile,
    user,
    authReady,
    profileId,
    awaitingProfileId,
    profileResolveTimedOut,
    retryProfileResolve,
    activeConversationId,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    rows,
    displayRows: displayState.displayRows,
    listPhase: displayState.listPhase,
    showEmpty: displayState.showEmpty,
    allConversations,
    isConversationTyping: isTyping,
    conversationPresenceMap: presenceMap,
    showSkeleton: displayState.showSkeleton,
    isFetching: query.isFetching,
    hasCachedRows,
    isFetched: query.isFetched,
    error: query.error,
    refetch: query.refetch,
    totalUnreadCount,
    pendingRequestCount,
    callCount: callConversationIds.size,
    unreadBadgeCount,
    needsReplyCount,
    bestFriendCount,
    nearbyCount: nearbyProfileIds.size,
    nearbyStatus: nearby.status,
    nearbyRetry: nearby.retry,
    redesignEnabled,
    categoryBarEnabled,
    activeCategory: inboxCategories.activeCategory,
    setActiveCategory: inboxCategories.setActiveCategory,
    registerCategoryChipRef: inboxCategories.registerChipRef,
    categoryBadges: categoryFilter.counts,
    categoryMatchCount: categoryFilter.matchCount,
    pendingRequests,
    storyGroups: normalizeStoryGroups(storyGroupsRaw),
    projectionEntries: projection.entries,
    projectionEnabled: projection.enabled,
    projectionReadEnabled: projection.projectionReadEnabled,
  };
}
