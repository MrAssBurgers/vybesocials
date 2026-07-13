import { startTransition, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatPrefetch } from '@/hooks/useChatPrefetch';
import { DMHeader } from './DMHeader';
import { DMCategoryTabs } from './DMCategoryTabs';
import { DMConversationList } from './DMConversationList';
import { useDMInbox } from './useDMInbox';

export function DMInboxPage() {
  const navigate = useNavigate();
  const { warmConversation } = useChatPrefetch();
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

  return (
    <section className="dm-inbox" aria-label="Direct messages">
      <span className="sr-only" role="status" aria-live="polite">
        {inbox.unreadBadgeCount > 0
          ? `${inbox.unreadBadgeCount} unread ${inbox.unreadBadgeCount === 1 ? 'message' : 'messages'}`
          : 'No unread messages'}
      </span>
      <div className="dm-inbox-column">
        <DMHeader
          totalUnreadCount={inbox.unreadBadgeCount}
          pendingRequestCount={inbox.pendingRequestCount}
          onSearch={() => navigate('/messages/search')}
        />
        <DMCategoryTabs
          active={inbox.activeTab}
          onChange={inbox.setActiveTab}
          redesignEnabled
          badges={{
            unread: inbox.unreadBadgeCount,
            requests: inbox.pendingRequestCount,
            needsReply: inbox.needsReplyCount,
            bestFriends: inbox.bestFriendCount,
            nearby: inbox.nearbyCount,
          }}
        />
        <DMConversationList
          rows={inbox.rows}
          profileId={inbox.profileId}
          authUid={inbox.user?.id}
          activeConversationId={inbox.activeConversationId}
          activeTab={inbox.activeTab}
          showSkeleton={inbox.showSkeleton}
          searchQuery={inbox.searchQuery}
          hasError={Boolean(inbox.error && inbox.isFetched)}
          nearbyStatus={inbox.nearbyStatus}
          onOpen={openChat}
          onWarm={warm}
          onRetry={() => void inbox.refetch()}
          onCompose={() => navigate('/messages/new')}
          onOpenNearbyPeer={(peerUserId) => {
            void (async () => {
              try {
                const { db } = await import('@/lib/firebase');
                const { data: convId, error } = await db.rpc('create_dm_conversation', {
                  other_profile_id: peerUserId,
                });
                if (error) throw error;
                if (convId) openChat(String(convId));
              } catch (error) {
                console.error(error);
              }
            })();
          }}
          onNearbyRetry={inbox.nearbyRetry}
        />
      </div>
    </section>
  );
}
