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
import { dmInboxPreviewStatus } from '@/lib/dmInboxPreviewStatus';
import { ensureArray, safeDmMembers } from '@/lib/persistedCollections';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { batchSignUrls } from '@/lib/signedUrlCache';
import type { DMInboxRow } from './dm.types';

const TAB_STORAGE_KEY = 'vybe-dm-inbox-tab';
const VALID_TABS: DmInboxTabId[] = ['friends', 'groups', 'requests', 'unread', 'calls'];

function initialTab(): DmInboxTabId {
  if (typeof sessionStorage === 'undefined') return 'friends';
  const stored = sessionStorage.getItem(TAB_STORAGE_KEY) as DmInboxTabId | null;
  return stored && VALID_TABS.includes(stored) ? stored : 'friends';
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
  const streakMap = useStreakMap();
  const query = useDMConversations(searchQuery);

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
      filterConversationsForTab(
        allConversations,
        activeTab,
        profileId,
        requestConversationIds,
        callConversationIds,
      ),
    [
      allConversations,
      activeTab,
      profileId,
      requestConversationIds,
      callConversationIds,
    ],
  );

  const rows = useMemo<DMInboxRow[]>(() => {
    return buildFlatInboxRows(filteredConversations, profileId).map((row) => {
      if (row.type === 'header') return row;
      const conversation = row.conversation;
      const resolved = conversation.is_group
        ? null
        : resolveOtherMemberFromConversation(conversation, profileId, user?.id);
      const other = resolved?.profile;
      const otherProfileId = other?.id ? String(other.id) : resolved?.user_id;
      const streakCount = otherProfileId
        ? streakMap.get(otherProfileId)?.streak_count
        : undefined;
      const membership = safeDmMembers(conversation.members).find(
        (member) => member.user_id === profileId,
      );
      const unreadCount = conversation.unread_count || 0;

      return {
        type: 'conversation' as const,
        preview: {
          conversation,
          id: conversation.id,
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
          statusLine: dmInboxPreviewStatus(
            conversation,
            profileId,
            user?.id,
            streakCount,
          ),
          unreadCount,
          isUnread: unreadCount > 0 || conversation._hasUnread,
          isPinned: Boolean(membership?.is_pinned),
          isMuted: Boolean(membership?.is_muted),
          isGroup: conversation.is_group,
          isTyping: isTyping(conversation.id),
          presenceActivity: presenceMap.get(conversation.id),
          streakCount,
        },
      };
    });
  }, [
    filteredConversations,
    profileId,
    user?.id,
    recentNewFriendIds,
    streakMap,
    isTyping,
    presenceMap,
  ]);

  useEffect(() => {
    const urls = rows.flatMap((row) =>
      row.type === 'conversation' && row.preview.avatarUrl ? [row.preview.avatarUrl] : [],
    );
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
  };
}
