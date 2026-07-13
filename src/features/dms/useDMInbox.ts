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
import { useStreakMap } from '@/hooks/useStreaks';
import { useCloseFriendIds } from '@/hooks/useCloseFriendIds';
import { useNearbyFriendLink } from '@/hooks/useNearbyFriendLink';
import {
  buildFlatInboxRows,
  filterConversationsForTab,
  type DmInboxTabId,
} from '@/lib/dmInboxOrganize';
import {
  displayNameForConversation,
  resolveOtherMemberFromConversation,
} from '@/lib/dmMemberResolve';
import { dmConversationPreviewText } from '@/lib/dmPreviewText';
import { resolveDmInboxStatus } from '@/lib/dmInboxStatus';
import { ensureArray, safeDmMembers } from '@/lib/persistedCollections';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { batchSignUrls } from '@/lib/signedUrlCache';
import type { DMConversationPreview, DMInboxRow, DMStoryState } from './dm.types';

const TAB_STORAGE_KEY = 'vybe-dm-inbox-tab';
const VALID_TABS: DmInboxTabId[] = [
  'friends',
  'best_friends',
  'nearby',
  'groups',
  'requests',
  'unread',
];

function initialTab(): DmInboxTabId {
  if (typeof sessionStorage === 'undefined') return 'friends';
  const stored = sessionStorage.getItem(TAB_STORAGE_KEY);
  if (stored === 'calls') return 'unread';
  return stored && VALID_TABS.includes(stored as DmInboxTabId)
    ? (stored as DmInboxTabId)
    : 'friends';
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

export function useDMInbox() {
  const { conversationId: activeConversationId } = useParams<{ conversationId?: string }>();
  const { profile, user } = useAuth();
  const profileId = useAuthProfileId();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTabState] = useState<DmInboxTabId>(initialTab);
  const { data: lockedIds } = useLockedChatIds();
  const { data: callConversationIds } = useInboxCallConversationIds();
  const { data: pendingRequests = [] } = useMessageRequests();
  const { data: pendingRequestCount = 0 } = usePendingRequestCount();
  const { data: recentNewFriendIds = new Set<string>() } = useRecentNewFriendProfileIds();
  const closeFriendIds = useCloseFriendIds();
  const streakMap = useStreakMap();
  const query = useDMConversations(searchQuery);
  const nearby = useNearbyFriendLink({
    enabled: activeTab === 'nearby',
    profileId,
    username: profile?.username,
    displayName: profile?.display_name,
    avatarUrl: profile?.avatar_url,
  });

  const allConversations = useMemo(
    () =>
      [...ensureArray(query.pinnedConversations), ...ensureArray(query.unpinnedConversations)]
        .filter((conversation) => !lockedIds?.has(conversation.id)),
    [query.pinnedConversations, query.unpinnedConversations, lockedIds],
  );

  const requestConversationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const request of pendingRequests) {
      const match = allConversations.find(
        (conversation) =>
          !conversation.is_group &&
          conversation.members?.some((member) => member.user_id === request.sender_id),
      );
      if (match) ids.add(match.id);
    }
    return ids;
  }, [pendingRequests, allConversations]);

  const nearbyProfileIds = useMemo(
    () => new Set(nearby.peers.map((peer) => peer.userId)),
    [nearby.peers],
  );

  // Story rings stay deferred — useStories has historically crashed inbox caches.
  const storyStateByProfileId = useMemo(
    () => new Map<string, DMStoryState>(),
    [],
  );

  const resolveOtherProfileId = useMemo(
    () => (conversation: (typeof allConversations)[number]) => {
      if (conversation.is_group) return undefined;
      const resolved = resolveOtherMemberFromConversation(conversation, profileId, user?.id);
      const other = resolved?.profile;
      return other?.id ? String(other.id) : resolved?.user_id;
    },
    [profileId, user?.id],
  );

  const typingConversationIds = useMemo(
    () => allConversations.slice(0, 30).map((conversation) => conversation.id),
    [allConversations],
  );
  const { isTyping } = useConversationTyping(typingConversationIds);
  const presenceMap = useConversationListPresence(
    allConversations,
    profileId,
    user?.id,
    activeConversationId,
  );

  const filteredConversations = useMemo(
    () =>
      filterConversationsForTab(allConversations, activeTab, {
        profileId,
        requestConversationIds,
        callConversationIds,
        closeFriendIds,
        nearbyProfileIds,
        resolveOtherProfileId,
      }),
    [
      allConversations,
      activeTab,
      profileId,
      requestConversationIds,
      callConversationIds,
      closeFriendIds,
      nearbyProfileIds,
      resolveOtherProfileId,
    ],
  );

  const rows = useMemo<DMInboxRow[]>(() => {
    return buildFlatInboxRows(filteredConversations, profileId).map((row) => {
      if (row.type === 'header') return row;
      const conversation = row.conversation;
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

      const preview: DMConversationPreview = {
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
        statusLine: status.line,
        statusKind: status.kind,
        deliveryStatus: status.label,
        latestMessageType: String(
          lastMessage?.message_type || lastMessage?.media_type || 'text',
        ),
        latestSenderId: lastMessage?.sender_id,
        latestMessageAt: lastMessage?.created_at,
        unreadCount,
        isUnread: unreadCount > 0 || conversation._hasUnread,
        isPinned: Boolean(membership?.is_pinned),
        isMuted: Boolean(membership?.is_muted),
        isGroup: conversation.is_group,
        isTyping: isTyping(conversation.id),
        isOnline,
        isAway: false,
        presenceActivity: activity,
        streakCount,
        storyState,
        isVerified: Boolean(other?.is_verified),
        relationshipBadge,
        quickReaction,
      };

      return { type: 'conversation' as const, preview };
    });
  }, [
    filteredConversations,
    profileId,
    user?.id,
    recentNewFriendIds,
    closeFriendIds,
    streakMap,
    isTyping,
    presenceMap,
    storyStateByProfileId,
  ]);

  useEffect(() => {
    const urls = rows.flatMap((row) => {
      if (row.type !== 'conversation') return [];
      return [row.preview.avatarUrl, row.preview.secondaryAvatarUrl].filter(
        (value): value is string => Boolean(value),
      );
    });
    if (urls.length) void batchSignUrls(urls);
  }, [rows]);

  const setActiveTab = (tab: DmInboxTabId) => {
    setActiveTabState(tab);
    try {
      sessionStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      // Storage can be unavailable in Safari private mode.
    }
  };

  const unreadBadgeCount = useMemo(() => {
    let count = query.totalUnreadCount;
    if (callConversationIds?.size) {
      for (const id of callConversationIds) {
        const match = allConversations.find((conversation) => conversation.id === id);
        if (!match) continue;
        if ((match.unread_count || 0) > 0 || match._hasUnread) continue;
        count += 1;
      }
    }
    return count;
  }, [query.totalUnreadCount, callConversationIds, allConversations]);

  return {
    profile,
    user,
    profileId,
    activeConversationId,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    rows,
    allConversations,
    showSkeleton: query.isLoading && allConversations.length === 0,
    isFetched: query.isFetched,
    error: query.error,
    refetch: query.refetch,
    totalUnreadCount: query.totalUnreadCount,
    pendingRequestCount,
    callCount: callConversationIds?.size ?? 0,
    unreadBadgeCount,
    bestFriendCount: closeFriendIds.size,
    nearbyCount: nearbyProfileIds.size,
    nearbyStatus: nearby.status,
  };
}
