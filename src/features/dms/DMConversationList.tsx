import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type UIEvent } from 'react';
import { MessageCircle, RefreshCw, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SwipeableDmConversationRow } from '@/components/chat/dm-inbox/SwipeableDmConversationRow';
import { HeldConversationOptionsSheet } from '@/components/chat/dm-inbox/HeldConversationOptionsSheet';
import { useHeldConversationOptions } from '@/hooks/useHeldConversationOptions';
import { StoryViewer } from '@/components/stories/StoryViewer';
import type { DMInboxRow, DmInboxTabId, InboxCategory } from './dm.types';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import type { NearbyFriendStatus } from '@/hooks/useNearbyFriendLink';
import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import type { MessageRequest } from '@/hooks/useMessageRequests';
import type { StoryGroup } from '@/hooks/useStories';
import {
  readFilterScroll,
  writeFilterScrollThrottled,
} from '@/lib/dmInboxFilterPersistence';
import { applyDmInboxRowLiveOverlay } from '@/lib/dmInboxRowOverlay';
import { logDmInboxGeometryReset } from './inbox/dmInboxDebug';
import { INBOX_CATEGORY_EMPTY } from './inbox/inboxCategoryModel';
import { NewConnectionsSection } from './inbox/NewConnectionsSection';
import type { DmInboxFilterId } from './dm.types';
import { DMComposeButton } from './DMComposeButton';
import { DMInboxSkeleton } from './DMInboxSkeleton';
import { DMRequestRow } from './DMRequestRow';
import { DMNearbyPeerRow } from './DMNearbyPeerRow';

interface DMConversationListProps {
  header?: ReactNode;
  rows: DMInboxRow[];
  displayRows: DMInboxRow[];
  profileId?: string;
  authUid?: string;
  activeConversationId?: string;
  activeTab?: DmInboxTabId;
  activeCategory?: InboxCategory | null;
  categoryMatchCount?: number;
  categoryBarEnabled?: boolean;
  pendingRequests?: MessageRequest[];
  isConversationTyping?: (conversationId: string) => boolean;
  conversationPresenceMap?: Map<string, ActivityType>;
  showSkeleton: boolean;
  showEmpty?: boolean;
  isFetching?: boolean;
  searchQuery: string;
  hasError: boolean;
  nearbyStatus?: NearbyFriendStatus;
  storyGroups?: StoryGroup[];
  onOpen: (conversationId: string, conversationHint?: LoadedDMConversation | null) => void;
  onWarm: (conversationId: string, conversationHint?: LoadedDMConversation | null) => void;
  onRetry: () => void;
  onCompose: () => void;
  onOpenNearbyPeer?: (peerUserId: string) => void;
  onNearbyRetry?: () => void;
}

function emptyCopy(
  tab: DmInboxTabId | undefined,
  searchQuery: string,
  hasError: boolean,
  nearbyStatus?: NearbyFriendStatus,
) {
  if (searchQuery) {
    return {
      title: 'No matches',
      body: `Nothing matched “${searchQuery}”`,
    };
  }
  if (hasError) {
    return {
      title: 'Couldn’t refresh chats',
      body: 'Check your connection and try again.',
    };
  }
  switch (tab) {
    case 'needs_reply':
      return {
        title: 'Nothing needs a reply',
        body: 'When someone messages you, unanswered chats land here.',
      };
    case 'pinned':
      return {
        title: 'No pinned chats',
        body: 'Swipe left on a chat and tap Pin to keep it here.',
      };
    case 'active':
      return {
        title: 'No active friends',
        body: 'Direct chats with online or recently active friends show up here.',
      };
    case 'groups':
      return {
        title: 'No groups yet',
        body: 'Start a group chat to hang with everyone at once.',
      };
    case 'unread':
      return {
        title: 'You’re all caught up',
        body: 'No unread chats right now.',
      };
    case 'nearby':
      if (nearbyStatus === 'locating' || nearbyStatus === 'searching') {
        return {
          title: 'Looking around…',
          body: 'Finding friends near you. Keep location on for a moment.',
        };
      }
      return {
        title: 'No nearby friends',
        body: 'When friends are close by, they’ll show up here.',
      };
    case 'requests':
      return {
        title: 'No requests',
        body: 'Message requests from new people will land here.',
      };
    default:
      return {
        title: 'No chats yet',
        body: 'Message friends, share snaps, and keep the streak alive.',
      };
  }
}

function asFilterId(tab?: DmInboxTabId): DmInboxFilterId {
  if (
    tab === 'all' ||
    tab === 'unread' ||
    tab === 'needs_reply' ||
    tab === 'groups' ||
    tab === 'pinned' ||
    tab === 'active'
  ) {
    return tab;
  }
  return 'all';
}

export function DMConversationList({
  header,
  rows,
  displayRows,
  profileId,
  authUid,
  activeConversationId,
  activeTab,
  activeCategory = null,
  categoryMatchCount = 0,
  categoryBarEnabled = false,
  pendingRequests = [],
  isConversationTyping,
  conversationPresenceMap,
  showSkeleton,
  showEmpty = false,
  isFetching = false,
  searchQuery,
  hasError,
  nearbyStatus,
  storyGroups = [],
  onOpen,
  onWarm,
  onRetry,
  onCompose,
  onOpenNearbyPeer,
  onNearbyRetry,
}: DMConversationListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const prevActiveConversationIdRef = useRef(activeConversationId);
  const lastRestoredScrollKeyRef = useRef<string | null>(null);
  const lastLoggedRowCountRef = useRef(0);
  const [composeHidden, setComposeHidden] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState<number | null>(null);
  const openStoryForUser = useCallback(
    (userId: string) => {
      const idx = storyGroups.findIndex((group) => group.user?.id === userId);
      if (idx >= 0) setStoryViewerIndex(idx);
    },
    [storyGroups],
  );
  const {
    held,
    openConversationOptions,
    setOptionsOpen,
    heldConversationId,
  } = useHeldConversationOptions();
  const empty = emptyCopy(activeTab, searchQuery, hasError, nearbyStatus);
  const nearbyBusy = nearbyStatus === 'locating' || nearbyStatus === 'searching';
  const filterId = asFilterId(activeTab);
  const scrollKey = categoryBarEnabled
    ? (activeCategory ?? 'all')
    : activeTab || filterId;
  const categoryEmpty =
    categoryBarEnabled && activeCategory && activeCategory !== 'all'
      ? INBOX_CATEGORY_EMPTY[activeCategory]
      : null;
  const showCategoryEmptyBanner =
    Boolean(categoryEmpty) && categoryMatchCount === 0 && displayRows.length > 0;
  const listLocked = held.isOpen;

  // Restore scroll once per filter key — not on every remount/data pass.
  useLayoutEffect(() => {
    if (activeConversationId) return;
    if (lastRestoredScrollKeyRef.current === scrollKey) return;
    const el = listRef.current;
    if (!el) return;
    const restored = readFilterScroll(scrollKey);
    el.scrollTop = restored;
    lastScrollTop.current = restored;
    lastRestoredScrollKeyRef.current = scrollKey;
    setComposeHidden(false);
  }, [scrollKey, activeConversationId]);

  // Chat → inbox: restore once when conversationId clears.
  useLayoutEffect(() => {
    const prev = prevActiveConversationIdRef.current;
    prevActiveConversationIdRef.current = activeConversationId;
    if (!prev || activeConversationId) return;
    const el = listRef.current;
    if (!el) return;
    const restored = readFilterScroll(scrollKey);
    el.scrollTop = restored;
    lastScrollTop.current = restored;
    lastRestoredScrollKeyRef.current = scrollKey;
  }, [activeConversationId, scrollKey]);

  useLayoutEffect(() => {
    const count = displayRows.length;
    const prev = lastLoggedRowCountRef.current;
    if (prev > 0 && count > 0 && count < prev * 0.6) {
      const el = listRef.current;
      logDmInboxGeometryReset('row-count-drop', {
        rowCount: count,
        previousRowCount: prev,
        scrollOffset: el?.scrollTop,
        viewportHeight: el?.clientHeight,
        totalSize: el?.scrollHeight,
        activeFilter: categoryBarEnabled ? activeCategory : activeTab,
      });
    }
    lastLoggedRowCountRef.current = count;
  }, [displayRows.length, categoryBarEnabled, activeCategory, activeTab]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const top = event.currentTarget.scrollTop;
    writeFilterScrollThrottled(scrollKey, top);
    const delta = top - lastScrollTop.current;
    if (Math.abs(delta) > 5) {
      setComposeHidden(delta > 0 && top > 64);
      lastScrollTop.current = top;
    }
  };

  const renderRows = displayRows.length > 0 ? displayRows : rows;
  const showListBody =
    renderRows.length > 0 || (categoryBarEnabled && activeCategory === 'new');
  const showNearbySkeleton =
    activeTab === 'nearby' && nearbyBusy && renderRows.length === 0 && !showSkeleton;

  return (
    <>
      <div className="dm-inbox-panel">
        <div
          ref={listRef}
          id="dm-inbox-list"
          className={listLocked ? 'dm-inbox-list dm-inbox-list--locked scroller' : 'dm-inbox-list scroller'}
          onScroll={handleScroll}
          aria-label="Conversations"
          role="tabpanel"
          aria-labelledby={`dm-inbox-tab-${activeTab || filterId}`}
        >
        {header}
        {showSkeleton || showNearbySkeleton ? (
          <DMInboxSkeleton />
        ) : showListBody ? (
          <div className="dm-inbox-rows">
            {categoryBarEnabled && activeCategory === 'new' && (
              <NewConnectionsSection
                pendingRequests={pendingRequests}
                profileId={profileId}
                onOpenConversation={(id) => onOpen(id)}
              />
            )}
            {showCategoryEmptyBanner && categoryEmpty && (
              <div className="dm-inbox-category-empty-banner" role="status">
                <h2>{categoryEmpty.title}</h2>
                <p>{categoryEmpty.body}</p>
              </div>
            )}
            {renderRows.map((row, index) => {
              if (row.type === 'header') return null;
              if (row.type === 'request') {
                return <DMRequestRow key={`request-${row.request.id}`} request={row.request} />;
              }
              if (row.type === 'nearby_peer') {
                return (
                  <DMNearbyPeerRow
                    key={`nearby-${row.peer.userId}`}
                    peer={row.peer}
                    onOpen={() => onOpenNearbyPeer?.(row.peer.userId)}
                  />
                );
              }
              const conversationId = row.preview.conversationId;
              const livePreview = applyDmInboxRowLiveOverlay(row.preview, {
                isTyping: isConversationTyping?.(conversationId) ?? row.preview.isTyping,
                presenceActivity:
                  conversationPresenceMap?.get(conversationId) ?? row.preview.presenceActivity,
              });
              return (
                <SwipeableDmConversationRow
                  key={conversationId}
                  conversation={row.preview.conversation}
                  preview={livePreview}
                  profileId={profileId}
                  authUid={authUid}
                  isActive={conversationId === activeConversationId}
                  priority={index < 12}
                  isTyping={livePreview.isTyping}
                  presenceActivity={livePreview.presenceActivity}
                  optionsOpenForRow={heldConversationId === conversationId}
                  onClick={() => onOpen(conversationId, row.preview.conversation)}
                  onWarm={() => onWarm(conversationId, row.preview.conversation)}
                  onOpenOptions={openConversationOptions}
                  onStoryTap={categoryBarEnabled ? openStoryForUser : undefined}
                  onQuickReply={
                    categoryBarEnabled
                      ? (id) => onOpen(id, row.preview.conversation)
                      : undefined
                  }
                />
              );
            })}
          </div>
        ) : showEmpty && !isFetching ? (
          <div className="dm-inbox-empty">
            <span className="dm-inbox-empty-icon">
              <MessageCircle />
            </span>
            <h2>{empty.title}</h2>
            <p>{empty.body}</p>
            <div className="flex gap-2">
              {hasError && (
                <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  Retry
                </Button>
              )}
              {activeTab === 'nearby' &&
                (nearbyStatus === 'denied' ||
                  nearbyStatus === 'unavailable' ||
                  nearbyStatus === 'error') &&
                onNearbyRetry && (
                  <Button type="button" variant="secondary" size="sm" onClick={onNearbyRetry}>
                    <RefreshCw className="mr-1.5 h-4 w-4" />
                    Try again
                  </Button>
                )}
              <Button type="button" variant="secondary" size="sm" onClick={onCompose}>
                <UserPlus className="mr-1.5 h-4 w-4" />
                Find friends
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      </div>
      <DMComposeButton hidden={composeHidden} />
      <HeldConversationOptionsSheet
        open={held.isOpen}
        preview={held.preview}
        onOpenChange={setOptionsOpen}
      />
      {storyViewerIndex != null && storyGroups.length > 0 && (
        <StoryViewer
          groups={storyGroups}
          initialGroupIndex={storyViewerIndex}
          onClose={() => setStoryViewerIndex(null)}
        />
      )}
    </>
  );
}
