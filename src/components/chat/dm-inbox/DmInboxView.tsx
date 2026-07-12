/**
 * Primary VYBE DM inbox — glass cards, sectioned layout, gradient hero.
 * Stable data path (useDMConversations only).
 */
import { useMemo, useState, useCallback, useEffect, startTransition } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  MessageCircle,
  RefreshCw,
  Search,
  Sparkles,
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
import { VybeWordmark } from '@/components/ui/VybeWordmark';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
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
    <div className="dm-inbox flex flex-col flex-1 min-h-0 w-full min-w-0 overflow-hidden">
      {/* Hero header */}
      <header className="dm-inbox-hero flex-shrink-0 relative">
        <div className="dm-inbox-hero-aurora pointer-events-none" aria-hidden />
        <div className="relative z-10 px-4 pt-[max(0.65rem,var(--sat,env(safe-area-inset-top)))] pb-3">
          <div className="flex items-start gap-3 mb-3">
            <button
              type="button"
              onClick={() => profile?.username && openFriendProfile(navigate, { username: profile.username, friendshipStatus: 'friends' })}
              className="shrink-0"
              aria-label="Your profile"
            >
              <Avatar className="h-10 w-10 ring-2 ring-primary/40 shadow-lg shadow-primary/20">
                <ProfileAvatarImage profileId={profile?.id} src={profile?.avatar_url || undefined} />
                <AvatarFallback className="text-xs font-bold bg-gradient-to-br from-primary to-accent text-primary-foreground">
                  {profile?.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </button>

            <div className="flex-1 min-w-0 pt-1 overflow-visible">
              <div className="flex items-center gap-2 overflow-visible min-h-[28px]">
                <VybeWordmark size="sm" as="h1" />
                {totalUnreadCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="dm-unread-orb text-[10px] font-bold"
                  >
                    {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                  </motion.span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 font-medium tracking-wide uppercase">
                Your conversations
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <TrashBin
                open={isTrashOpen}
                onOpenChange={setIsTrashOpen}
                trigger={
                  <Button
                    size="icon"
                    variant="ghost"
                    className="relative h-10 w-10 rounded-2xl text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]"
                    aria-label="Deleted chats"
                  >
                    <Trash2 className="h-4 w-4" />
                    {trashedCount > 0 && (
                      <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
                    )}
                  </Button>
                }
              />
              <Button
                size="icon"
                className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg shadow-primary/30 hover:opacity-90"
                onClick={() => navigate('/messages/new')}
                aria-label="New message"
              >
                <PenLine className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
            <Input
              placeholder="Search chats"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="dm-search pl-10 h-10 rounded-2xl border-0 text-sm bg-foreground/[0.06]"
            />
          </div>

          <div className="flex gap-2 mb-1">
            <DmInboxTabs
              active={inboxTab}
              onChange={setInboxTab}
              badges={{
                unread: totalUnreadCount,
                requests: pendingRequestCount,
                calls: callConvIds?.size ?? 0,
              }}
            />
            <button
              type="button"
              onClick={() => setShowGlobalSearch(true)}
              className="dm-inbox-chip shrink-0"
              aria-label="Search messages"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <ChatSearchSheet open={showGlobalSearch} onOpenChange={setShowGlobalSearch} />

      {/* Quick lanes */}
      <div className="px-3 pb-2 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
        <button
          type="button"
          onClick={() => navigate('/VYBE-AI')}
          className="dm-inbox-lane shrink-0"
        >
          <span className="dm-inbox-lane-icon dm-inbox-lane-icon--ai">
            <VybeMiniIcon size={18} showSparkles />
          </span>
          <span className="dm-inbox-lane-label">VYBE-AI</span>
          <Sparkles className="h-3 w-3 text-primary/80 ml-auto" />
        </button>
        <button
          type="button"
          onClick={() => navigate('/messages/new')}
          className="dm-inbox-lane shrink-0"
        >
          <span className="dm-inbox-lane-icon">
            <UserPlus className="h-4 w-4 text-primary" />
          </span>
          <span className="dm-inbox-lane-label">New chat</span>
        </button>
      </div>

      {/* List */}
      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scroller px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"
        onScroll={onScroll}
      >
        {showSkeleton ? (
          <div className="space-y-3 pt-1">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-2xl opacity-60" />
            ))}
          </div>
        ) : inboxRows.length > 0 ? (
            <div className="space-y-2 pt-1" style={{ paddingTop, paddingBottom }}>
              {(() => {
                let conversationIndex = 0;
                return rowsToRender.map((row) =>
                  row.type === 'header' ? (
                    <div key={`header-${row.id}`} className="dm-inbox-section-label first:mt-0 mt-3">
                      <span>{row.label}</span>
                      <span className="dm-inbox-section-count">{row.count}</span>
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
          <div className="dm-inbox-empty flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="dm-inbox-empty-orb mb-5">
              <MessageCircle className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">
              {searchQuery ? 'No matches' : 'Start your vibe'}
            </h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-[240px]">
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
                className="rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground"
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
