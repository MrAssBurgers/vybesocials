import { useEffect, useRef, useState, type UIEvent } from 'react';
import { MessageCircle, RefreshCw, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SwipeableDmConversationRow } from '@/components/chat/dm-inbox/SwipeableDmConversationRow';
import { useDmInboxVirtualSlice } from '@/hooks/useDmInboxVirtualSlice';
import type { DMInboxRow, DmInboxTabId } from './dm.types';
import type { NearbyFriendStatus } from '@/hooks/useNearbyFriendLink';
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
  onOpen: (conversationId: string) => void;
  onQuickReply: (conversationId: string) => void;
  onWarm: (conversationId: string) => void;
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
    case 'best_friends':
      return {
        title: 'No best friends yet',
        body: 'Long-press a chat and tap Best Friend to keep your inner circle here.',
      };
    case 'nearby':
      if (nearbyStatus === 'locating' || nearbyStatus === 'searching') {
        return {
          title: 'Looking around…',
          body: 'Finding friends near you. Keep location on for a moment.',
        };
      }
      if (nearbyStatus === 'denied' || nearbyStatus === 'unavailable') {
        return {
          title: 'Location needed',
          body: 'Allow location access to see friends nearby.',
        };
      }
      if (nearbyStatus === 'error') {
        return {
          title: 'Nearby failed',
          body: 'Couldn’t check who’s nearby. Try again.',
        };
      }
      return {
        title: 'No nearby friends',
        body: 'When friends are close by, they’ll show up here.',
      };
    case 'groups':
      return {
        title: 'No groups yet',
        body: 'Start a group chat to hang with everyone at once.',
      };
    case 'requests':
      return {
        title: 'No requests',
        body: 'Message requests from new people will land here.',
      };
    case 'unread':
      return {
        title: 'You’re all caught up',
        body: 'No unread chats or recent missed calls right now.',
      };
    default:
      return {
        title: 'No chats yet',
        body: 'Message friends, share snaps, and keep the streak alive.',
      };
  }
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
  onQuickReply,
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
  const empty = emptyCopy(activeTab, searchQuery, hasError, nearbyStatus);
  const nearbyBusy = nearbyStatus === 'locating' || nearbyStatus === 'searching';

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = 0;
    lastScrollTop.current = 0;
    setComposeHidden(false);
  }, [activeTab]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    onScroll?.(event);
    const top = event.currentTarget.scrollTop;
    const delta = top - lastScrollTop.current;
    if (Math.abs(delta) > 5) {
      setComposeHidden(delta > 0 && top > 64);
      lastScrollTop.current = top;
    }
  };

  return (
    <>
      <div
        ref={listRef}
        className="dm-inbox-list scroller"
        onScroll={handleScroll}
        aria-label="Conversations"
      >
        {showSkeleton || (activeTab === 'nearby' && nearbyBusy && rows.length === 0) ? (
          <DMInboxSkeleton />
        ) : rows.length > 0 ? (
          <div className="dm-inbox-rows" style={{ paddingTop, paddingBottom }}>
            {renderRows.map((row) => {
              if (row.type === 'header') {
                return (
                  <div className="dm-inbox-section-label" key={`header-${row.id}`}>
                    <span>{row.label}</span>
                    <span className="dm-inbox-section-count">{row.count}</span>
                  </div>
                );
              }
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
                  onClick={() => onOpen(row.preview.id)}
                  onQuickReply={() => onQuickReply(row.preview.id)}
                  onWarm={() => onWarm(row.preview.id)}
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
      <DMComposeButton hidden={composeHidden} />
    </>
  );
}
