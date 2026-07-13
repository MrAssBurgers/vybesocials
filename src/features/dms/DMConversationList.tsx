import { useEffect, useRef, useState, type UIEvent } from 'react';
import { MessageCircle, RefreshCw, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SwipeableDmConversationRow } from '@/components/chat/dm-inbox/SwipeableDmConversationRow';
import { HeldConversationOptionsSheet } from '@/components/chat/dm-inbox/HeldConversationOptionsSheet';
import { useHeldConversationOptions } from '@/hooks/useHeldConversationOptions';
import { useDmInboxVirtualSlice } from '@/hooks/useDmInboxVirtualSlice';
import type { DMInboxRow, DmInboxTabId } from './dm.types';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import type { NearbyFriendStatus } from '@/hooks/useNearbyFriendLink';
import {
  readFilterScroll,
  writeFilterScroll,
} from '@/lib/dmInboxFilterPersistence';
import type { DmInboxFilterId } from './dm.types';
import { DMComposeButton } from './DMComposeButton';
import { DMInboxSkeleton } from './DMInboxSkeleton';
import { DMRequestRow } from './DMRequestRow';
import { DMNearbyPeerRow } from './DMNearbyPeerRow';

interface DMConversationListProps {
  rows: DMInboxRow[];
  profileId?: string;
  authUid?: string;
  activeConversationId?: string;
  activeTab?: DmInboxTabId;
  showSkeleton: boolean;
  searchQuery: string;
  hasError: boolean;
  nearbyStatus?: NearbyFriendStatus;
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
  rows,
  profileId,
  authUid,
  activeConversationId,
  activeTab,
  showSkeleton,
  searchQuery,
  hasError,
  nearbyStatus,
  onOpen,
  onWarm,
  onRetry,
  onCompose,
  onOpenNearbyPeer,
  onNearbyRetry,
}: DMConversationListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const [composeHidden, setComposeHidden] = useState(false);
  const { visible, paddingTop, paddingBottom, onScroll, virtualized } =
    useDmInboxVirtualSlice(rows);
  const renderRows = virtualized ? visible : rows;
  const {
    held,
    openConversationOptions,
    setOptionsOpen,
    heldConversationId,
  } = useHeldConversationOptions();
  const empty = emptyCopy(activeTab, searchQuery, hasError, nearbyStatus);
  const nearbyBusy = nearbyStatus === 'locating' || nearbyStatus === 'searching';
  const filterId = asFilterId(activeTab);
  const scrollKey = activeTab || filterId;

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const restored = readFilterScroll(scrollKey);
    el.scrollTop = restored;
    lastScrollTop.current = restored;
    setComposeHidden(false);
  }, [scrollKey]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    onScroll?.(event);
    const top = event.currentTarget.scrollTop;
    writeFilterScroll(scrollKey, top);
    const delta = top - lastScrollTop.current;
    if (Math.abs(delta) > 5) {
      setComposeHidden(delta > 0 && top > 64);
      lastScrollTop.current = top;
    }
  };

  return (
    <>
      <div className="dm-inbox-panel">
        <div
          ref={listRef}
          id="dm-inbox-list"
          className="dm-inbox-list scroller"
          onScroll={handleScroll}
          aria-label="Conversations"
          role="tabpanel"
          aria-labelledby={`dm-inbox-tab-${activeTab || filterId}`}
        >
        {showSkeleton || (activeTab === 'nearby' && nearbyBusy && rows.length === 0) ? (
          <DMInboxSkeleton />
        ) : rows.length > 0 ? (
          <div className="dm-inbox-rows" style={{ paddingTop, paddingBottom }}>
            {renderRows.map((row) => {
              // Section headers removed — continuous list only.
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
              return (
                <SwipeableDmConversationRow
                  key={row.preview.id}
                  conversation={row.preview.conversation}
                  preview={row.preview}
                  profileId={profileId}
                  authUid={authUid}
                  isActive={row.preview.id === activeConversationId}
                  priority
                  isTyping={row.preview.isTyping}
                  presenceActivity={row.preview.presenceActivity}
                  optionsOpenForRow={heldConversationId === row.preview.id}
                  onClick={() => onOpen(row.preview.id, row.preview.conversation)}
                  onWarm={() => onWarm(row.preview.id, row.preview.conversation)}
                  onOpenOptions={openConversationOptions}
                />
              );
            })}
          </div>
        ) : (
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
        )}
      </div>
      </div>
      <DMComposeButton hidden={composeHidden} />
      <HeldConversationOptionsSheet
        open={held.isOpen}
        preview={held.preview}
        onOpenChange={setOptionsOpen}
      />
    </>
  );
}
