import { useRef, useState, type UIEvent } from 'react';
import { MessageCircle, RefreshCw, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SwipeableDmConversationRow } from '@/components/chat/dm-inbox/SwipeableDmConversationRow';
import { useDmInboxVirtualSlice } from '@/hooks/useDmInboxVirtualSlice';
import type { DMInboxRow } from './dm.types';
import { DMComposeButton } from './DMComposeButton';
import { DMInboxSkeleton } from './DMInboxSkeleton';

interface DMConversationListProps {
  rows: DMInboxRow[];
  profileId?: string;
  authUid?: string;
  activeConversationId?: string;
  showSkeleton: boolean;
  searchQuery: string;
  hasError: boolean;
  onOpen: (conversationId: string) => void;
  onQuickReply: (conversationId: string) => void;
  onWarm: (conversationId: string) => void;
  onRetry: () => void;
  onCompose: () => void;
}

export function DMConversationList({
  rows,
  profileId,
  authUid,
  activeConversationId,
  showSkeleton,
  searchQuery,
  hasError,
  onOpen,
  onQuickReply,
  onWarm,
  onRetry,
  onCompose,
}: DMConversationListProps) {
  const lastScrollTop = useRef(0);
  const [composeHidden, setComposeHidden] = useState(false);
  const { visible, paddingTop, paddingBottom, onScroll, virtualized } =
    useDmInboxVirtualSlice(rows);
  const renderRows = virtualized ? visible : rows;

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
        className="dm-inbox-list scroller"
        onScroll={handleScroll}
        aria-label="Conversations"
      >
        {showSkeleton ? (
          <DMInboxSkeleton />
        ) : rows.length > 0 ? (
          <div className="dm-inbox-rows" style={{ paddingTop, paddingBottom }}>
            {renderRows.map((row) =>
              row.type === 'header' ? (
                <div className="dm-inbox-section-label" key={`header-${row.id}`}>
                  <span>{row.label}</span>
                  <span className="dm-inbox-section-count">{row.count}</span>
                </div>
              ) : (
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
              ),
            )}
          </div>
        ) : (
          <div className="dm-inbox-empty">
            <span className="dm-inbox-empty-icon">
              <MessageCircle />
            </span>
            <h2>{searchQuery ? 'No matches' : 'No chats yet'}</h2>
            <p>
              {hasError && !searchQuery
                ? "We couldn't refresh your chats."
                : searchQuery
                  ? `Nothing matched “${searchQuery}”`
                  : 'Message friends, share snaps, and keep the streak alive.'}
            </p>
            <div className="flex gap-2">
              {hasError && (
                <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  Retry
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
