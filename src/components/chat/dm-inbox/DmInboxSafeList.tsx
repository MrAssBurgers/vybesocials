/**
 * Fallback if the primary inbox tree errors.
 * Reuses the same filtered inbox hook so tabs still work.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DMHeader } from '@/features/dms/DMHeader';
import { DMCategoryTabs } from '@/features/dms/DMCategoryTabs';
import { DMConversationList } from '@/features/dms/DMConversationList';
import { useDMInbox } from '@/features/dms/useDMInbox';
import { db } from '@/lib/firebase';
import { isDmLeaveSuppressActive } from '@/lib/leaveDmConversation';
import { InboxNotes } from '@/features/dms/InboxNotes';

export function DmInboxSafeList() {
  const navigate = useNavigate();
  const inbox = useDMInbox();

  const openChat = useCallback(
    (conversationId: string) => {
      if (isDmLeaveSuppressActive()) return;
      void navigate(`/messages/${conversationId}`);
    },
    [navigate],
  );

  const openNearbyPeer = useCallback(
    (peerUserId: string) => {
      void (async () => {
        try {
          const { data: convId, error } = await db.rpc('create_dm_conversation', {
            other_profile_id: peerUserId,
          });
          if (error) throw error;
          if (convId) openChat(String(convId));
        } catch (error) {
          console.error(error);
        }
      })();
    },
    [openChat],
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
          onSearch={() => navigate('/messages/search')}
        />
        <DMCategoryTabs
          active={inbox.activeTab}
          onChange={inbox.setActiveTab}
          redesignEnabled={inbox.redesignEnabled}
          badges={{
            unread: inbox.unreadBadgeCount,
            requests: inbox.pendingRequestCount,
            needsReply: inbox.needsReplyCount,
            bestFriends: inbox.bestFriendCount,
            nearby: inbox.nearbyCount,
          }}
        />
        <DMConversationList
          header={<InboxNotes />}
          rows={inbox.rows}
          displayRows={inbox.displayRows}
          profileId={inbox.profileId}
          authUid={inbox.user?.id}
          activeConversationId={inbox.activeConversationId}
          activeTab={inbox.activeTab}
          showSkeleton={inbox.showSkeleton}
          showEmpty={inbox.showEmpty}
          isFetching={inbox.isFetching}
          searchQuery={inbox.searchQuery}
          hasError={Boolean(inbox.error && inbox.isFetched)}
          nearbyStatus={inbox.nearbyStatus}
          onOpen={openChat}
          onWarm={() => undefined}
          onRetry={() => void inbox.refetch()}
          onCompose={() => navigate('/messages/new')}
          onOpenNearbyPeer={openNearbyPeer}
          onNearbyRetry={inbox.nearbyRetry}
        />
      </div>
    </section>
  );
}
