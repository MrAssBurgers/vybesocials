import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useDMConversations } from '@/hooks/useDMConversations';
import { useConversationTyping } from '@/hooks/useConversationTyping';
import { useConversationListPresence } from '@/hooks/useConversationListPresence';
import { useInboxCallConversationIds } from '@/hooks/useInboxCallConversationIds';
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
import { projectionToLoadedConversation } from '@/lib/dmInboxProjection';
import { isDmInboxProjectionReadEnabled, isRelationshipEmojiUiEnabled, isRelationshipProjectionReadEnabled } from '@/lib/dmInboxFeatureFlags';
import { pickPrimaryInboxEmoji, resolveStreakDisplay } from '@/lib/relationship/relationshipEmojiMap';
import { useRelationshipEmojiPreferences } from '@/hooks/useRelationshipEmojiPreferences';
import { writeStoredInboxFilter } from '@/lib/dmInboxFilterPersistence';
import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import type { DMConversationPreview, DMInboxRow, DMStoryState, DmInboxFilterId, DmInboxTabId } from './dm.types';

const TAB_STORAGE_KEY = 'vybe-dm-inbox-tab';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTabState] = useState<DmInboxTabId>(() => initialTab(false));
  const { data: lockedIdsRaw } = useLockedChatIds();
  const { data: callConversationIdsRaw } = useInboxCallConversationIds();
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
  const nearby = useNearbyFriendLink({
    enabled: Boolean(profileId),
    profileId,
    username: profile?.username,
    displayName: profile?.display_name,
    avatarUrl: profile?.avatar_url,
  });
  const projection = useDmInboxProjection(profileId);

  const lockedIds = useMemo(() => ensureStringSet(lockedIdsRaw), [lockedIdsRaw]);
  const callConversationIds = useMemo(
    () => ensureStringSet(callConversationIdsRaw),
    [callConversationIdsRaw],
  );
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

  const allConversations = useMemo(() => {
    const legacy = [
      ...ensureArray(query.pinnedConversations),
      ...ensureArray(query.unpinnedConversations),
    ].filter((conversation) => !lockedIds.has(conversation.id));

    // Projection is the UI data contract only when the read flag is on.
    // Until then legacy remains the visible source; projection is shadow-only.
    if (!isDmInboxProjectionReadEnabled(profileId, user?.id) || !projection.entries.length) {
      return legacy;
    }

    const fromProjection = projection.entries
      .map(projectionToLoadedConversation)
      .filter((conversation) => !lockedIds.has(conversation.id));
    return fromProjection.length ? fromProjection : legacy;
  }, [
    query.pinnedConversations,
    query.unpinnedConversations,
    lockedIds,
    projection.entries,
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

  const typingConversationIds = useMemo(
    () => allConversations.slice(0, 30).map((conversation) => conversation.id),
    [allConversations],
  );
  const { isTyping } = useConversationTyping(typingConversationIds);
  const presenceMapRaw = useConversationListPresence(
    allConversations,
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

  const filteredConversations = useMemo(
    () =>
      filterConversationsForTab(allConversations, activeTab, {
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
      allConversations,
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
      const activity = presenceMap.get(conversation.id);
      const isOnline = Boolean(activity && activity !== 'idle');
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
        pinOrder: 0,
        isMuted: Boolean(membership?.is_muted),
        isArchived: false,
        needsReply: conversationNeedsReply(conversation, profileId),
        isGroup: conversation.is_group,
        isTyping: isTyping(conversation.id),
        typingNames: [],
        isOnline,
        isAway: false,
        presenceState: isOnline ? 'online' : 'offline',
        presenceActivity: activity,
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
    isTyping,
    presenceMap,
    storyStateByProfileId,
    projectionByConversationId,
    relationshipEmojiUi,
    emojiPrefs,
  ]);

  const rows = useMemo<DMInboxRow[]>(() => {
    if (activeTab === 'requests') {
      return pendingRequests.map((request) => ({
        type: 'request' as const,
        request,
      }));
    }

    if (activeTab === 'nearby') {
      const conversationRows: DMInboxRow[] = filteredConversations.map((conversation) => ({
        type: 'conversation' as const,
        preview: toPreview(conversation),
      }));
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

    return filteredConversations.map((conversation) => ({
      type: 'conversation' as const,
      preview: toPreview(conversation),
    }));
  }, [
    activeTab,
    pendingRequests,
    filteredConversations,
    toPreview,
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
    if (urls.length) void batchSignUrls(urls);
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

  const unreadBadgeCount = useMemo(() => {
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

  const bestFriendCount = useMemo(() => {
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

  const totalUnreadCount = useMemo(() => {
    return allConversations.reduce((sum, conversation) => {
      if ((conversation.unread_count || 0) > 0) return sum + (conversation.unread_count || 0);
      if (conversation._hasUnread) return sum + 1;
      return sum;
    }, 0);
  }, [allConversations]);

  const needsReplyCount = useMemo(() => {
    return allConversations.filter((conversation) =>
      conversationNeedsReply(conversation, profileId),
    ).length;
  }, [allConversations, profileId]);

  const showSkeleton =
    (query.isLoading && allConversations.length === 0) ||
    (activeTab === 'best_friends' && closeFriendsLoading && !closeFriendsFetched) ||
    (activeTab === 'requests' && requestsLoading && pendingRequests.length === 0);

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
    allConversations,
    showSkeleton,
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
    projectionEntries: projection.entries,
    projectionEnabled: projection.enabled,
    projectionReadEnabled: projection.projectionReadEnabled,
  };
}
