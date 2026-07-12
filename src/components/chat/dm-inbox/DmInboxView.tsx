/**
 * Primary VYBE DM inbox — glass cards, sectioned layout, gradient hero.
 * Stable data path (useDMConversations only).
 */
import { useMemo, useState, useCallback, useEffect, startTransition } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  MessageCircle,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  PenLine,
} from 'lucide-react';
import { useDMConversations } from '@/hooks/useDMConversations';
import { useTrashedConversationIds } from '@/hooks/useTrashedConversations';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useAuth } from '@/lib/auth';
import { ensureArray } from '@/lib/persistedCollections';
import {
  buildFlatInboxRows,
  filterConversationsForTab,
  type DmInboxTabId,
} from '@/lib/dmInboxOrganize';
import { resolveOtherMemberFromConversation } from '@/lib/dmMemberResolve';
import { SwipeableDmConversationRow } from './SwipeableDmConversationRow';
import { DmInboxTabs } from './DmInboxTabs';
import { openFriendProfile } from '@/lib/friendProfileRoutes';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { batchSignUrls } from '@/lib/signedUrlCache';
import { TrashBin } from '@/components/chat/TrashBin';
import { useChatPrefetch } from '@/hooks/useChatPrefetch';
import { useConversationTyping } from '@/hooks/useConversationTyping';
import { useConversationListPresence } from '@/hooks/useConversationListPresence';
import { usePendingRequestCount, useMessageRequests } from '@/hooks/useMessageRequests';
import { useInboxCallConversationIds } from '@/hooks/useInboxCallConversationIds';
import { useLockedChatIds } from '@/hooks/useLockedChats';
import { useDmInboxVirtualSlice } from '@/hooks/useDmInboxVirtualSlice';
import { ChatSearchSheet } from '@/components/chat/ChatSearchSheet';

export function DmInboxView() {
  const navigate = useNavigate();
  const { conversationId: activeConversationId } = useParams<{ conversationId?: string }>();
  const { profile, user } = useAuth();
  const profileId = useAuthProfileId();
  const { warmConversation } = useChatPrefetch();
  const [searchQuery, setSearchQuery] = useState('');
  const [inboxTab, setInboxTab] = useState<DmInboxTabId>('friends');
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const { data: trashedIds } = useTrashedConversationIds();
  const { data: lockedIds } = useLockedChatIds();
  const { data: callConvIds } = useInboxCallConversationIds();
  const { data: pendingRequests = [] } = useMessageRequests();
  const { data: pendingRequestCount = 0 } = usePendingRequestCount();
  const trashedCount = trashedIds?.size ?? 0;

  const {
    pinnedConversations,
    unpinnedConversations,
    isLoading,
    isFetched,
    error,
    refetch,
    totalUnreadCount,
  } = useDMConversations(searchQuery);

  const allRows = useMemo(
    () => [
      ...ensureArray(pinnedConversations),
      ...ensureArray(unpinnedConversations),
    ].filter((c) => !lockedIds?.has(c.id)),
    [pinnedConversations, unpinnedConversations, lockedIds],
  );

  const requestConversationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const req of pendingRequests) {
      const match = allRows.find(
        (c) =>
          !c.is_group &&
          c.members?.some((m) => m.user_id === req.sender_id),
      );
      if (match) ids.add(match.id);
    }
    return ids;
  }, [pendingRequests, allRows]);

  const typingConversationIds = useMemo(
    () => allRows.slice(0, 30).map((c) => c.id),
    [allRows],
  );
  const { isTyping: checkTyping } = useConversationTyping(typingConversationIds);
  const presenceMap = useConversationListPresence(allRows, profileId, user?.id, activeConversationId);

  const tabFilteredRows = useMemo(
    () =>
      filterConversationsForTab(
        allRows,
        inboxTab,
        profileId,
        requestConversationIds,
        callConvIds,
      ),
    [allRows, inboxTab, profileId, requestConversationIds, callConvIds],
  );

  const filteredRows = useMemo(() => {
    if (inboxTab !== 'unread') return tabFilteredRows;
    return tabFilteredRows.filter((c) => (c.unread_count || 0) > 0 || c._hasUnread);
  }, [tabFilteredRows, inboxTab]);

  const inboxRows = useMemo(
    () => buildFlatInboxRows(filteredRows, profileId),
    [filteredRows, profileId],
  );

  const { visible: visibleRows, paddingTop, paddingBottom, onScroll, virtualized } =
    useDmInboxVirtualSlice(inboxRows);
  const rowsToRender = virtualized ? visibleRows : inboxRows;

  useEffect(() => {
    const urls = allRows.flatMap((conv) => {
      if (conv.is_group) {
        return conv.avatar_url ? [conv.avatar_url] : [];
      }
      const resolved = resolveOtherMemberFromConversation(conv, profileId, user?.id);
      const other = resolved?.profile;
      const otherProfileId = other?.id ? String(other.id) : resolved?.user_id;
      const url = resolveProfileAvatarUrl(
        otherProfileId,
        other?.avatar_url as string | null | undefined,
      );
      return url ? [url] : [];
    });
    if (urls.length) batchSignUrls(urls).catch(() => {});
  }, [allRows, profileId, user?.id]);

  const showSkeleton = isLoading && allRows.length === 0;

  const handleConversationWarm = useCallback(
    (convId: string) => {
      warmConversation(convId, 'high');
    },
    [warmConversation],
  );

  const openChat = useCallback(
    (id: string) => {
      if (id === activeConversationId) return;
      warmConversation(id, 'high');
      startTransition(() => {
        navigate(`/messages/${id}`);
      });
    },
    [navigate, warmConversation, activeConversationId],
  );

  const openChatWithReply = useCallback(
    (id: string) => {
      warmConversation(id, 'high');
      startTransition(() => {
        navigate(`/messages/${id}?compose=1`);
      });
    },
    [navigate, warmConversation],
  );

  return (
    <div className="dm-inbox flex flex-col flex-1 min-h-0 w-full min-w-0 overflow-hidden bg-background">
      <header className="dm-inbox-hero flex-shrink-0">
        <div className="px-4 pt-[max(0.5rem,var(--sat,env(safe-area-inset-top)))] pb-2">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() =>
                  profile?.username &&
                  openFriendProfile(navigate, { username: profile.username, friendshipStatus: 'friends' })
                }
                className="shrink-0"
                aria-label="Your profile"
              >
                <Avatar className="h-9 w-9">
                  <ProfileAvatarImage profileId={profile?.id} src={profile?.avatar_url || undefined} priority />
                  <AvatarFallback className="text-xs font-semibold bg-muted">
                    {profile?.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="dm-inbox-title">Chat</h1>
                  {totalUnreadCount > 0 && (
                    <span className="dm-inbox-title-badge">
                      {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <TrashBin
                open={isTrashOpen}
                onOpenChange={setIsTrashOpen}
                trigger={
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                    aria-label="Deleted chats"
                  >
                    <Trash2 className="h-[18px] w-[18px]" />
                    {trashedCount > 0 && (
                      <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive" />
                    )}
                  </Button>
                }
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 rounded-full text-foreground hover:bg-foreground/5"
                onClick={() => navigate('/messages/new')}
                aria-label="New message"
              >
                <PenLine className="h-[18px] w-[18px]" />
              </Button>
            </div>
          </div>

          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="dm-inbox-search pl-9 h-9 rounded-lg border-0 text-sm"
            />
          </div>

          <DmInboxTabs
            active={inboxTab}
            onChange={setInboxTab}
            badges={{
              unread: totalUnreadCount,
              requests: pendingRequestCount,
              calls: callConvIds?.size ?? 0,
            }}
          />
        </div>
      </header>

      <ChatSearchSheet open={showGlobalSearch} onOpenChange={setShowGlobalSearch} />

      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scroller dm-inbox-list pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"
        onScroll={onScroll}
      >
        {showSkeleton ? (
          <div className="dm-inbox-skeleton-list">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-none opacity-50" />
            ))}
          </div>
        ) : inboxRows.length > 0 ? (
            <div className="dm-inbox-rows" style={{ paddingTop, paddingBottom }}>
              {(() => {
                let conversationIndex = 0;
                return rowsToRender.map((row) =>
                  row.type === 'header' ? (
                    <div key={`header-${row.id}`} className="dm-inbox-section-label">
                      <span>{row.label}</span>
                      {row.count > 0 && <span className="dm-inbox-section-count">{row.count}</span>}
                    </div>
                  ) : (
                    <SwipeableDmConversationRow
                      key={row.conversation.id}
                      conversation={row.conversation}
                      profileId={profileId}
                      authUid={user?.id}
                      isActive={row.conversation.id === activeConversationId}
                      priority={conversationIndex++ < 8}
                      isTyping={checkTyping(row.conversation.id)}
                      presenceActivity={presenceMap.get(row.conversation.id)}
                      onClick={() => openChat(row.conversation.id)}
                      onQuickReply={() => openChatWithReply(row.conversation.id)}
                      onWarm={() => handleConversationWarm(row.conversation.id)}
                    />
                  ),
                );
              })()}
            </div>
        ) : (
          <div className="dm-inbox-empty flex flex-col items-center justify-center py-20 px-8 text-center">
            <div className="dm-inbox-empty-icon mb-4">
              <MessageCircle className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="text-base font-semibold mb-1.5">
              {searchQuery ? 'No matches' : 'No chats yet'}
            </h2>
            <p className="text-sm text-muted-foreground mb-5 max-w-[260px] leading-relaxed">
              {error && isFetched && !searchQuery
                ? "We couldn't refresh your chats. Try again or start a new one."
                : searchQuery
                  ? `Nothing matched "${searchQuery}"`
                  : 'Message friends, share snaps, and keep the streak alive.'}
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {error && isFetched && (
                <Button variant="secondary" size="sm" className="rounded-full" onClick={() => refetch()}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Retry
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                className="rounded-full"
                onClick={() => navigate('/messages/new')}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                Find friends
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
