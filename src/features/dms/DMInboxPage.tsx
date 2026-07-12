import { startTransition, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChatSearchSheet } from '@/components/chat/ChatSearchSheet';
import { useChatPrefetch } from '@/hooks/useChatPrefetch';
import { DMHeader } from './DMHeader';
import { DMCategoryTabs } from './DMCategoryTabs';
import { DMConversationList } from './DMConversationList';
import { useDMInbox } from './useDMInbox';

export function DMInboxPage() {
  const navigate = useNavigate();
  const { warmConversation } = useChatPrefetch();
  const [searchOpen, setSearchOpen] = useState(false);
  const inbox = useDMInbox();

  const warm = useCallback(
    (conversationId: string) => warmConversation(conversationId, 'high'),
    [warmConversation],
  );

  const openChat = useCallback(
    (conversationId: string) => {
      if (conversationId === inbox.activeConversationId) return;
      warm(conversationId);
      startTransition(() => {
        void navigate(`/messages/${conversationId}`);
      });
    },
    [inbox.activeConversationId, navigate, warm],
  );

  const openQuickReply = useCallback(
    (conversationId: string) => {
      warm(conversationId);
      startTransition(() => {
        void navigate(`/messages/${conversationId}?compose=1`);
      });
    },
    [navigate, warm],
  );

  return (
    <section className="dm-inbox" aria-label="Direct messages">
      <div className="dm-inbox-column">
        <DMHeader
          totalUnreadCount={inbox.totalUnreadCount}
          onSearch={() => setSearchOpen(true)}
        />
        <DMCategoryTabs
          active={inbox.activeTab}
          onChange={inbox.setActiveTab}
          badges={{
            unread: inbox.totalUnreadCount,
            requests: inbox.pendingRequestCount,
            calls: inbox.callCount,
          }}
        />
        <DMConversationList
          rows={inbox.rows}
          profileId={inbox.profileId}
          authUid={inbox.user?.id}
          activeConversationId={inbox.activeConversationId}
          showSkeleton={inbox.showSkeleton}
          searchQuery={inbox.searchQuery}
          hasError={Boolean(inbox.error && inbox.isFetched)}
          onOpen={openChat}
          onQuickReply={openQuickReply}
          onWarm={warm}
          onRetry={() => void inbox.refetch()}
          onCompose={() => navigate('/messages/new')}
        />
      </div>
      <ChatSearchSheet open={searchOpen} onOpenChange={setSearchOpen} />
    </section>
  );
}
